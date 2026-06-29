import asyncio
import re
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from config import SONGS_DIR, AUDIO_QUALITY, MAX_DOWNLOAD_DURATION, COBALT_API_URL
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


def _extract_cobalt_url(cobalt_data: dict) -> str:
    """Extract download URL from cobalt response, handling all status types."""
    status = cobalt_data.get("status")

    if status == "error":
        error = cobalt_data.get("error", "unknown")
        if isinstance(error, dict):
            error = error.get("code", "unknown")
        raise RuntimeError(f"Cobalt error: {error}")

    # tunnel and redirect both have a top-level url
    if status in ("tunnel", "redirect"):
        download_url = cobalt_data.get("url")
        if download_url:
            return download_url

    # picker: cobalt returns multiple options, grab the first one
    if status == "picker":
        picker = cobalt_data.get("picker")
        if picker and len(picker) > 0:
            download_url = picker[0].get("url")
            if download_url:
                return download_url

    # Fallback: try url field regardless of status
    download_url = cobalt_data.get("url")
    if download_url:
        return download_url

    raise RuntimeError(f"Cobalt: no download URL (status={status})")


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
        final_path = None
        try:
            await update_task_progress(db, task_id, 0.1, "running")

            info = await get_video_info(url)

            final_title = title or info["title"]
            final_artist = artist or info["artist"]

            safe_name = sanitize_filename(f"{final_artist} - {final_title}" if final_artist else final_title)
            final_path = SONGS_DIR / f"{safe_name}.mp3"

            await update_task_progress(db, task_id, 0.2, "running")

            # Request audio URL from cobalt API
            async with httpx.AsyncClient(timeout=60) as client:
                cobalt_resp = await client.post(
                    f"{COBALT_API_URL}/",
                    json={
                        "url": url,
                        "audioFormat": "mp3",
                        "audioBitrate": AUDIO_QUALITY,
                        "downloadMode": "audio",
                    },
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
                cobalt_resp.raise_for_status()
                cobalt_data = cobalt_resp.json()

            download_url = _extract_cobalt_url(cobalt_data)

            await update_task_progress(db, task_id, 0.3, "running")

            # Stream the MP3 to disk (64KB chunks, ~64KB peak memory)
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(connect=15, read=60, write=15, pool=15),
                follow_redirects=True,
            ) as client:
                async with client.stream("GET", download_url) as stream:
                    stream.raise_for_status()
                    total = int(stream.headers.get("content-length", 0))
                    downloaded = 0
                    last_reported_pct = 0.3
                    with open(final_path, "wb") as f:
                        async for chunk in stream.aiter_bytes(chunk_size=65536):
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total > 0:
                                pct = 0.3 + 0.55 * (downloaded / total)
                                # Throttle: only report every ~5% to avoid DB thrashing
                                if pct - last_reported_pct >= 0.05:
                                    last_reported_pct = pct
                                    await update_task_progress(db, task_id, min(pct, 0.85), "running")

            await update_task_progress(db, task_id, 0.85, "running")

            if not final_path.exists() or final_path.stat().st_size == 0:
                raise FileNotFoundError(f"Downloaded file is empty or missing: {safe_name}")

            # Fast analysis with mutagen (duration, basic metadata)
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
            db.add(song)
            db.commit()
            db.refresh(song)

            await complete_task(db, task_id)
            await ws_manager.broadcast("song_added", {"song_id": song.id})

            # Full analysis in background (BPM, key, waveform) - non-blocking
            song_id = song.id
            file_path_str = str(final_path)
            asyncio.create_task(_background_analyze(db, song_id, file_path_str))

        except Exception as e:
            # Cleanup partial file on failure
            if final_path and final_path.exists():
                final_path.unlink(missing_ok=True)
            await complete_task(db, task_id, error=str(e))

    asyncio.create_task(_do_download())
    return task_id


async def _background_analyze(db: Session, song_id: int, file_path: str):
    """Run full librosa analysis in background and update the song."""
    try:
        analysis = await asyncio.to_thread(analyze_audio_full, file_path)
        song = db.query(Song).filter(Song.id == song_id).first()
        if song:
            song.bpm = analysis["bpm"]
            song.key = analysis["key"]
            song.waveform_peaks = analysis["waveform_peaks"]
            db.commit()
            await ws_manager.broadcast("song_updated", {"song_id": song_id})
    except Exception:
        pass  # Analysis failure is non-critical
