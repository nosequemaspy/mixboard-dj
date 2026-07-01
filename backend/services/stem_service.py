import asyncio
import logging
import subprocess
from pathlib import Path

from sqlalchemy.orm import Session

from config import STEMS_DIR, SONGS_DIR
from models.song import Song
from models.stem import Stem
from tasks.background import create_task, update_task_progress, complete_task
from websocket.manager import ws_manager

logger = logging.getLogger(__name__)

# Free Hugging Face Space running Demucs v4 on GPU
HF_DEMUCS_SPACE = "abidlabs/music-separation"


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

            try:
                await _separate_with_hf(db, task_id, str(song_file), instrumental_path)
            except Exception as e:
                logger.warning(f"HF Space failed ({e}), falling back to FFmpeg")
                await _separate_with_ffmpeg(db, task_id, str(song_file), instrumental_path)

            await update_task_progress(db, task_id, 0.9, "running")

            if not instrumental_path.exists() or instrumental_path.stat().st_size == 0:
                raise FileNotFoundError("Vocal separation produced no output")

            # Remove old stems for this song
            db.query(Stem).filter(Stem.song_id == song_id).delete()

            stem = Stem(
                song_id=song_id,
                stem_type="instrumental",
                file_path=str(instrumental_path.relative_to(STEMS_DIR.parent.parent)),
                model_used="demucs-hf",
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


async def _separate_with_hf(db, task_id, song_file_path: str, instrumental_path: Path):
    """Separate vocals using free Hugging Face Demucs Space (no API key needed)."""
    from gradio_client import Client, handle_file
    import shutil

    await update_task_progress(db, task_id, 0.2, "running")

    def _run():
        client = Client(HF_DEMUCS_SPACE)
        result = client.predict(
            audio=handle_file(song_file_path),
            api_name="/predict",
        )
        return result

    await update_task_progress(db, task_id, 0.3, "running")

    # Blocks while HF processes (may queue 1-3 min on free GPU)
    result = await asyncio.to_thread(_run)

    await update_task_progress(db, task_id, 0.75, "running")

    # result = (vocals_path, instrumental_path)
    _, inst_temp = result
    inst_temp_path = str(inst_temp)
    logger.info(f"HF Demucs completed, instrumental at: {inst_temp_path}")

    # Convert WAV output to MP3
    cmd = [
        "ffmpeg", "-y",
        "-i", inst_temp_path,
        "-b:a", "320k",
        str(instrumental_path),
    ]
    convert_result = await asyncio.to_thread(
        subprocess.run, cmd,
        capture_output=True, text=True, timeout=120,
    )
    if convert_result.returncode != 0:
        raise RuntimeError(f"ffmpeg WAV→MP3 failed: {convert_result.stderr[-200:]}")


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
