import asyncio
import subprocess
from pathlib import Path

from sqlalchemy.orm import Session

from config import STEMS_DIR, SONGS_DIR
from models.song import Song
from models.stem import Stem
from tasks.background import create_task, update_task_progress, complete_task
from websocket.manager import ws_manager


async def separate_stems(db: Session, song_id: int) -> str:
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise ValueError(f"Song {song_id} not found")

    task_id = await create_task(db, "stem_separation", song_id)
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

            await update_task_progress(db, task_id, 0.2, "running")

            # Create instrumental using ffmpeg center-channel removal
            # This cancels vocals (center-panned) by subtracting L from R
            instrumental_path = output_dir / "instrumental.mp3"

            def run_ffmpeg():
                cmd = [
                    "ffmpeg", "-y",
                    "-i", str(song_file),
                    "-af", "pan=stereo|c0=c0-c1|c1=c1-c0",
                    "-b:a", "320k",
                    str(instrumental_path),
                ]
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode != 0:
                    raise RuntimeError(f"ffmpeg failed: {result.stderr[-500:]}")

            await asyncio.to_thread(run_ffmpeg)
            await update_task_progress(db, task_id, 0.8, "running")

            if not instrumental_path.exists() or instrumental_path.stat().st_size == 0:
                raise FileNotFoundError("ffmpeg produced no output")

            # Remove old stems for this song if any
            db.query(Stem).filter(Stem.song_id == song_id).delete()

            stem = Stem(
                song_id=song_id,
                stem_type="instrumental",
                file_path=str(instrumental_path.relative_to(STEMS_DIR.parent.parent)),
                model_used="ffmpeg-center-cancel",
            )
            db.add(stem)

            await update_task_progress(db, task_id, 0.9, "running")

            song_ref = db.query(Song).filter(Song.id == song_id).first()
            if song_ref:
                song_ref.stems_status = "ready"
                db.commit()
            else:
                db.commit()

            await complete_task(db, task_id)
            await ws_manager.broadcast("stems_ready", {"song_id": song_id})

        except Exception as e:
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
