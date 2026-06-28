import asyncio
import re
from pathlib import Path

from sqlalchemy.orm import Session

from config import SONGS_DIR, SUPPORTED_FORMATS, YTDLP_AUDIO_QUALITY, MAX_DOWNLOAD_DURATION
from models.song import Song
from tasks.background import create_task, update_task_progress, complete_task
from services.analysis import analyze_audio
from services.storage import check_storage_available
from websocket.manager import ws_manager


def sanitize_filename(name: str) -> str:
    # Remove path separators and other dangerous chars
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    # Remove leading/trailing dots and spaces
    name = name.strip('. ')
    return name[:200] if name else "download"


def _find_js_runtimes() -> dict | None:
    """Find a JS runtime (node/deno/bun) for yt-dlp signature extraction."""
    import shutil
    for runtime in ("node", "deno", "bun"):
        path = shutil.which(runtime)
        if path:
            return {runtime: {"path": path}}
    return None


def _base_ydl_opts() -> dict:
    """Common yt-dlp options with JS runtime if available."""
    opts = {"quiet": True, "no_warnings": True}
    js_runtimes = _find_js_runtimes()
    if js_runtimes:
        opts["js_runtimes"] = js_runtimes
    return opts


def get_video_info(url: str) -> dict:
    import yt_dlp
    ydl_opts = {**_base_ydl_opts(), "extract_flat": False}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "title": info.get("title", "Unknown"),
        "artist": info.get("uploader", info.get("artist", "")),
        "duration_seconds": info.get("duration", 0),
        "thumbnail_url": info.get("thumbnail"),
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
        try:
            await update_task_progress(db, task_id, 0.1, "running")

            info = await asyncio.to_thread(get_video_info, url)

            # Check duration limit
            duration = info.get("duration_seconds", 0)
            if duration > MAX_DOWNLOAD_DURATION:
                raise ValueError(
                    f"Video demasiado largo ({int(duration // 60)}m). "
                    f"Maximo permitido: {MAX_DOWNLOAD_DURATION // 60} minutos."
                )

            final_title = title or info["title"]
            final_artist = artist or info["artist"]

            safe_name = sanitize_filename(f"{final_artist} - {final_title}" if final_artist else final_title)
            output_path = str(SONGS_DIR / f"{safe_name}.%(ext)s")

            await update_task_progress(db, task_id, 0.2, "running")

            import yt_dlp

            # Track progress via a shared mutable
            progress_state = {"last_pct": 0.2}

            def progress_hook(d):
                if d["status"] == "downloading":
                    total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                    downloaded = d.get("downloaded_bytes", 0)
                    if total > 0:
                        pct = 0.2 + 0.6 * (downloaded / total)
                        progress_state["last_pct"] = pct

            ydl_opts = {
                **_base_ydl_opts(),
                "format": "bestaudio/best",
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": YTDLP_AUDIO_QUALITY,
                }],
                "outtmpl": output_path,
                "progress_hooks": [progress_hook],
            }

            def do_download():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])

            await asyncio.to_thread(do_download)
            await update_task_progress(db, task_id, 0.85, "running")

            # Find the downloaded file
            final_path = SONGS_DIR / f"{safe_name}.mp3"
            if not final_path.exists():
                # Search for any supported format with the same name
                found = False
                for f in SONGS_DIR.iterdir():
                    if f.stem == safe_name and f.suffix.lower() in SUPPORTED_FORMATS:
                        final_path = f
                        found = True
                        break
                if not found:
                    raise FileNotFoundError(f"Downloaded file not found: {safe_name}")

            # Analyze
            analysis = await asyncio.to_thread(analyze_audio, str(final_path))
            await update_task_progress(db, task_id, 0.95, "running")

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
            db.add(song)
            db.commit()
            db.refresh(song)

            await complete_task(db, task_id)
            await ws_manager.broadcast("song_added", {"song_id": song.id})

        except Exception as e:
            await complete_task(db, task_id, error=str(e))

    asyncio.create_task(_do_download())
    return task_id
