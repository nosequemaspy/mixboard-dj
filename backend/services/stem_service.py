import asyncio
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from config import STEMS_DIR, DEMUCS_MODEL, SONGS_DIR
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
        try:
            await update_task_progress(db, task_id, 0.1, "running")

            song_file = Path(song.file_path)
            if not song_file.is_absolute():
                song_file = SONGS_DIR.parent.parent / song_file

            output_dir = STEMS_DIR / str(song_id)
            output_dir.mkdir(parents=True, exist_ok=True)

            await update_task_progress(db, task_id, 0.15, "running")

            def run_demucs():
                import demucs.separate
                import sys
                sys.argv = [
                    "demucs",
                    "-n", DEMUCS_MODEL,
                    "--out", str(output_dir),
                    "--mp3",
                    str(song_file),
                ]
                demucs.separate.main()

            await asyncio.to_thread(run_demucs)
            await update_task_progress(db, task_id, 0.8, "running")

            # Find separated stems
            stem_dir = None
            for d in output_dir.rglob("*"):
                if d.is_dir() and (d / "vocals.mp3").exists():
                    stem_dir = d
                    break

            if not stem_dir:
                raise FileNotFoundError("Demucs output stems not found")

            stem_types = ["vocals", "drums", "bass", "other"]
            for stem_type in stem_types:
                stem_file = stem_dir / f"{stem_type}.mp3"
                if stem_file.exists():
                    dest = output_dir / f"{stem_type}.mp3"
                    if dest != stem_file:
                        shutil.move(str(stem_file), str(dest))
                    stem = Stem(
                        song_id=song_id,
                        stem_type=stem_type,
                        file_path=str(dest.relative_to(STEMS_DIR.parent.parent)),
                        model_used=DEMUCS_MODEL,
                    )
                    db.add(stem)

            await update_task_progress(db, task_id, 0.9, "running")

            # Create instrumental (drums + bass + other)
            from pydub import AudioSegment
            drums = AudioSegment.from_mp3(str(output_dir / "drums.mp3"))
            bass = AudioSegment.from_mp3(str(output_dir / "bass.mp3"))
            other = AudioSegment.from_mp3(str(output_dir / "other.mp3"))
            instrumental = drums.overlay(bass).overlay(other)
            instrumental_path = output_dir / "instrumental.mp3"
            instrumental.export(str(instrumental_path), format="mp3", bitrate="320k")

            stem = Stem(
                song_id=song_id,
                stem_type="instrumental",
                file_path=str(instrumental_path.relative_to(STEMS_DIR.parent.parent)),
                model_used=DEMUCS_MODEL,
            )
            db.add(stem)

            # Clean up demucs intermediate dirs
            for d in output_dir.iterdir():
                if d.is_dir():
                    shutil.rmtree(d)

            song_ref = db.query(Song).filter(Song.id == song_id).first()
            song_ref.stems_status = "ready"
            db.commit()

            await complete_task(db, task_id)
            await ws_manager.broadcast("stems_ready", {"song_id": song_id})

        except Exception as e:
            song_ref = db.query(Song).filter(Song.id == song_id).first()
            if song_ref:
                song_ref.stems_status = "error"
                db.commit()
            await complete_task(db, task_id, error=str(e))

    asyncio.create_task(_do_separation())
    return task_id
