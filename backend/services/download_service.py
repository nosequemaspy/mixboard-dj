import asyncio
import logging
import re
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from config import SONGS_DIR, MAX_DOWNLOAD_DURATION
from database import SessionLocal
from models.song import Song
from tasks.background import create_task, update_task_progress, complete_task
from services.analysis import analyze_audio_fast, analyze_audio_full
from services.storage import check_storage_available
from websocket.manager import ws_manager


def sanitize_filename(name: str) -> str:
    # Remove path separators and other dangerous chars
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    # Remove leading/trailing dots and spaces
    name = name.strip('. ')
    return name[:200] if name else "download"


async def get_video_info(url: str) -> dict:
    """Get video metadata via YouTube oEmbed API."""
    oembed_url = "https://www.youtube.com/oembed"
    params = {"url": url, "format": "json"}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(oembed_url, params=params)
        resp.raise_for_status()
        data = resp.json()

    title = data.get("title", "Unknown")
    artist = data.get("author_name", "")
    thumbnail_url = data.get("thumbnail_url")

    return {
        "title": title,
        "artist": artist,
        "duration_seconds": 0,  # oEmbed doesn't provide duration; mutagen gets it later
        "thumbnail_url": thumbnail_url,
        "url": url,
    }


async def download_from_youtube(db: Session, url: str, title: str | None = None, artist: str | None = None) -> str:
    # Pre-check: storage space available
    has_space, used, limit = check_storage_available(needed_bytes=15 * 1024 * 1024)  # estimate 15MB needed
    if not has_space:
        raise ValueError(
            f"Sin espacio: {used // (1024*1024)} MB usados de {limit // (1024*1024)} MB. "
            "Elimina canciones para liberar espacio."
        )

    task_id = await create_task(db, "download")

    async def _do_download():
        # Create own DB session — the request-scoped session is closed by now
        bg_db = SessionLocal()
        final_path = None
        try:
            await update_task_progress(bg_db, task_id, 0.1, "running")

            info = await get_video_info(url)

            final_title = title or info["title"]
            final_artist = artist or info["artist"]

            safe_name = sanitize_filename(f"{final_artist} - {final_title}" if final_artist else final_title)

            await update_task_progress(bg_db, task_id, 0.2, "running")

            # Download audio in native format (m4a/webm) — no mp3 conversion needed
            # This skips the slow ffmpeg re-encoding step
            output_template = str(SONGS_DIR / f"{safe_name}.%(ext)s")
            cmd = [
                "yt-dlp",
                "--format", "bestaudio",
                "-o", output_template,
                "--no-playlist",
                "--max-filesize", "50m",
                "--newline",
                "--concurrent-fragments", "4",
                url,
            ]
            logger.info(f"Running yt-dlp: {' '.join(cmd)}")

            await update_task_progress(bg_db, task_id, 0.3, "running")

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )

            last_pct = 0.3
            async for line in proc.stdout:
                text = line.decode(errors="replace").strip()
                # Parse lines like "[download]  45.2% of ~  5.00MiB ..."
                m = re.search(r'\[download\]\s+([\d.]+)%', text)
                if m:
                    dl_pct = float(m.group(1)) / 100.0
                    # Map download 0-100% to task progress 0.3-0.85
                    pct = 0.3 + 0.55 * dl_pct
                    if pct - last_pct >= 0.05:
                        last_pct = pct
                        await update_task_progress(bg_db, task_id, min(pct, 0.85), "running")

            returncode = await asyncio.wait_for(proc.wait(), timeout=300)

            if returncode != 0:
                logger.error(f"yt-dlp failed (code {returncode})")
                raise RuntimeError(f"yt-dlp failed with exit code {returncode}")

            await update_task_progress(bg_db, task_id, 0.85, "running")

            # Find the downloaded file (extension depends on YouTube format)
            candidates = sorted(
                SONGS_DIR.glob(f"{safe_name}.*"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            if not candidates:
                raise FileNotFoundError(f"Downloaded file not found: {safe_name}")
            final_path = candidates[0]
            logger.info(f"Downloaded: {final_path.name} ({final_path.stat().st_size // 1024}KB)")

            if final_path.stat().st_size == 0:
                raise FileNotFoundError(f"Downloaded file is empty: {safe_name}")

            # Fast analysis with mutagen (duration, basic metadata)
            await update_task_progress(bg_db, task_id, 0.9, "running")
            analysis = await asyncio.to_thread(analyze_audio_fast, str(final_path))
            duration = analysis.get("duration_seconds", 0)
            if duration > MAX_DOWNLOAD_DURATION:
                final_path.unlink(missing_ok=True)
                final_path = None  # prevent double-cleanup
                raise ValueError(
                    f"Audio demasiado largo ({int(duration // 60)}m). "
                    f"Maximo permitido: {MAX_DOWNLOAD_DURATION // 60} minutos."
                )

            song = Song(
                title=final_title,
                artist=final_artist,
                duration_seconds=analysis["duration_seconds"],
                bpm=analysis["bpm"],
                key=analysis["key"],
                file_path=str(final_path.relative_to(SONGS_DIR.parent.parent)),
                file_format=final_path.suffix.lstrip("."),
                source_url=url,
                source_type="youtube",
                waveform_peaks=analysis["waveform_peaks"],
            )
            bg_db.add(song)
            bg_db.commit()
            bg_db.refresh(song)

            await complete_task(bg_db, task_id)
            await ws_manager.broadcast("song_added", {"song_id": song.id})

            # Full analysis in background (BPM, key, waveform) - non-blocking
            song_id = song.id
            file_path_str = str(final_path)
            asyncio.create_task(_background_analyze(song_id, file_path_str))

        except Exception as e:
            logger.error(f"Download failed: {type(e).__name__}: {e}")
            # Cleanup partial file on failure
            if final_path and final_path.exists():
                final_path.unlink(missing_ok=True)
            await complete_task(bg_db, task_id, error=str(e))
        finally:
            bg_db.close()

    asyncio.create_task(_do_download())
    return task_id


async def _background_analyze(song_id: int, file_path: str):
    """Run full librosa analysis in background and update the song."""
    bg_db = SessionLocal()
    try:
        analysis = await asyncio.to_thread(analyze_audio_full, file_path)
        song = bg_db.query(Song).filter(Song.id == song_id).first()
        if song:
            song.bpm = analysis["bpm"]
            song.key = analysis["key"]
            song.waveform_peaks = analysis["waveform_peaks"]
            bg_db.commit()
            await ws_manager.broadcast("song_updated", {"song_id": song_id})
    except Exception:
        pass  # Analysis failure is non-critical
    finally:
        bg_db.close()
