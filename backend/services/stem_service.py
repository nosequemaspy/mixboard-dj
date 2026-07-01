import asyncio
import logging
import subprocess
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from config import STEMS_DIR, SONGS_DIR, REPLICATE_API_TOKEN
from models.song import Song
from models.stem import Stem
from tasks.background import create_task, update_task_progress, complete_task
from websocket.manager import ws_manager

logger = logging.getLogger(__name__)


async def separate_stems(db: Session, song_id: int) -> str:
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise ValueError(f"Song {song_id} not found")

    task_id = await create_task(db, "vocal_separation", song_id)
    song.stems_status = "processing"
    db.commit()

    async def _do_separation():
        output_dir = STEMS_DIR / str(song_id)
        try:
            await update_task_progress(db, task_id, 0.1, "running")

            song_file = Path(song.file_path)
            if not song_file.is_absolute():
                song_file = SONGS_DIR.parent.parent / song_file

            if not song_file.exists():
                raise FileNotFoundError(f"Song file not found: {song_file}")

            output_dir.mkdir(parents=True, exist_ok=True)
            instrumental_path = output_dir / "instrumental.mp3"

            if REPLICATE_API_TOKEN:
                await _separate_with_replicate(db, task_id, str(song_file), instrumental_path)
            else:
                logger.warning("REPLICATE_API_TOKEN not set, using basic FFmpeg fallback")
                await _separate_with_ffmpeg(db, task_id, str(song_file), instrumental_path)

            await update_task_progress(db, task_id, 0.9, "running")

            if not instrumental_path.exists() or instrumental_path.stat().st_size == 0:
                raise FileNotFoundError("Vocal separation produced no output")

            # Remove old stems for this song if any
            db.query(Stem).filter(Stem.song_id == song_id).delete()

            stem = Stem(
                song_id=song_id,
                stem_type="instrumental",
                file_path=str(instrumental_path.relative_to(STEMS_DIR.parent.parent)),
                model_used="demucs-replicate" if REPLICATE_API_TOKEN else "ffmpeg-center-cancel",
            )
            db.add(stem)

            song_ref = db.query(Song).filter(Song.id == song_id).first()
            if song_ref:
                song_ref.stems_status = "ready"
                db.commit()
            else:
                db.commit()

            await complete_task(db, task_id)
            await ws_manager.broadcast("stems_ready", {"song_id": song_id})

        except Exception as e:
            logger.error(f"Vocal separation failed: {type(e).__name__}: {e}")
            song_ref = db.query(Song).filter(Song.id == song_id).first()
            if song_ref:
                song_ref.stems_status = "error"
                try:
                    db.commit()
                except Exception:
                    db.rollback()
            await complete_task(db, task_id, error=str(e))

    asyncio.create_task(_do_separation())
    return task_id


async def _separate_with_replicate(db, task_id, song_file_path: str, instrumental_path: Path):
    """Separate vocals using Replicate's Demucs AI model."""
    headers = {"Authorization": f"Bearer {REPLICATE_API_TOKEN}"}

    await update_task_progress(db, task_id, 0.15, "running")

    async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=600)) as client:
        # Upload audio file to Replicate
        with open(song_file_path, "rb") as f:
            file_data = f.read()

        upload_resp = await client.post(
            "https://api.replicate.com/v1/files",
            headers=headers,
            files={"content": ("audio.mp3", file_data, "audio/mpeg")},
        )
        upload_resp.raise_for_status()
        file_url = upload_resp.json()["urls"]["get"]
        logger.info(f"Uploaded audio to Replicate: {file_url}")

        await update_task_progress(db, task_id, 0.25, "running")

        # Create Demucs prediction
        pred_resp = await client.post(
            "https://api.replicate.com/v1/models/cjwbw/demucs/predictions",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "input": {
                    "audio": file_url,
                    "output_format": "mp3",
                }
            },
        )
        pred_resp.raise_for_status()
        pred_data = pred_resp.json()
        pred_url = pred_data["urls"]["get"]
        logger.info(f"Replicate prediction created: {pred_data['id']}")

        # Poll for completion
        await update_task_progress(db, task_id, 0.3, "running")
        poll_count = 0
        while True:
            await asyncio.sleep(3)
            poll_count += 1

            status_resp = await client.get(pred_url, headers=headers)
            status_data = status_resp.json()
            status = status_data["status"]

            if status == "succeeded":
                break
            elif status in ("failed", "canceled"):
                error = status_data.get("error", "Unknown error")
                raise RuntimeError(f"Demucs failed: {error}")

            # Progress 0.3 → 0.7 during AI processing
            pct = min(0.3 + poll_count * 0.04, 0.7)
            await update_task_progress(db, task_id, pct, "running")

        await update_task_progress(db, task_id, 0.75, "running")

        output = status_data["output"]
        logger.info(f"Replicate output: {list(output.keys()) if isinstance(output, dict) else type(output)}")

        if not isinstance(output, dict):
            raise RuntimeError(f"Unexpected output type: {type(output)}")

        # Handle output: prefer accompaniment/no_vocals, else mix bass+drums+other
        if "accompaniment" in output:
            inst_url = output["accompaniment"]
        elif "no_vocals" in output:
            inst_url = output["no_vocals"]
        elif "bass" in output and "drums" in output and "other" in output:
            # 4-stem output: download and mix bass + drums + other
            stem_paths = []
            for stem_name in ["bass", "drums", "other"]:
                stem_url = output[stem_name]
                stem_path = instrumental_path.parent / f"_{stem_name}.mp3"
                resp = await client.get(stem_url)
                resp.raise_for_status()
                stem_path.write_bytes(resp.content)
                stem_paths.append(str(stem_path))

            await update_task_progress(db, task_id, 0.85, "running")

            # Mix stems into instrumental
            cmd = [
                "ffmpeg", "-y",
                "-i", stem_paths[0],
                "-i", stem_paths[1],
                "-i", stem_paths[2],
                "-filter_complex", "amix=inputs=3:duration=longest:normalize=0",
                "-b:a", "320k",
                str(instrumental_path),
            ]
            result = await asyncio.to_thread(
                subprocess.run, cmd,
                capture_output=True, text=True, timeout=120,
            )

            for p in stem_paths:
                Path(p).unlink(missing_ok=True)

            if result.returncode != 0:
                raise RuntimeError(f"ffmpeg mix failed: {result.stderr[-200:]}")
            return
        else:
            raise RuntimeError(f"Unexpected output keys: {list(output.keys())}")

        # Download single instrumental file
        resp = await client.get(inst_url)
        resp.raise_for_status()
        instrumental_path.write_bytes(resp.content)


async def _separate_with_ffmpeg(db, task_id, song_file_path: str, instrumental_path: Path):
    """Fallback: basic center-channel cancellation (lower quality)."""
    await update_task_progress(db, task_id, 0.2, "running")

    def run_ffmpeg():
        af_filter = (
            "asplit=2[low][cancel];"
            "[low]lowpass=f=200,volume=2.0[bass];"
            "[cancel]highpass=f=200,"
            "pan=stereo|c0=c0-0.9*c1|c1=c1-0.9*c0,"
            "volume=2.0[vocal_removed];"
            "[bass][vocal_removed]amix=inputs=2:duration=longest,"
            "dynaudnorm=p=0.95:m=10"
        )
        cmd = [
            "ffmpeg", "-y",
            "-i", song_file_path,
            "-af", af_filter,
            "-b:a", "320k",
            str(instrumental_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {result.stderr[-500:]}")

    await asyncio.to_thread(run_ffmpeg)
    await update_task_progress(db, task_id, 0.8, "running")
