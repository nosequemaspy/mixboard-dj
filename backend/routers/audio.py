from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from config import SONGS_DIR, STEMS_DIR, EDITS_DIR
from database import get_db
from models.song import Song
from models.stem import Stem
from models.edit import EditedSong
from schemas.edit import EditRequest, EditedSongResponse
from services.audio_edit import trim_audio, cut_sections, vocal_mute_sections

router = APIRouter(prefix="/api/audio", tags=["audio"])


def resolve_path(relative_path: str) -> Path:
    p = Path(relative_path)
    if p.is_absolute():
        return p
    return SONGS_DIR.parent.parent / p


def range_file_response(file_path: Path, request: Request):
    """Serve file with HTTP Range support for seeking."""
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")

    content_type = "audio/mpeg"
    ext = file_path.suffix.lower()
    if ext == ".wav":
        content_type = "audio/wav"
    elif ext == ".flac":
        content_type = "audio/flac"
    elif ext == ".ogg":
        content_type = "audio/ogg"
    elif ext in (".m4a", ".aac"):
        content_type = "audio/mp4"

    if range_header:
        range_val = range_header.strip().split("=")[-1]
        start_str, end_str = range_val.split("-")
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
        content_length = end - start + 1

        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk = f.read(min(8192, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iterfile(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )

    return FileResponse(file_path, media_type=content_type, headers={"Accept-Ranges": "bytes"})


@router.get("/stream/{song_id}")
def stream_song(song_id: int, request: Request, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    file_path = resolve_path(song.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return range_file_response(file_path, request)


@router.get("/stem/{stem_id}")
def stream_stem(stem_id: int, request: Request, db: Session = Depends(get_db)):
    stem = db.query(Stem).filter(Stem.id == stem_id).first()
    if not stem:
        raise HTTPException(status_code=404, detail="Stem not found")
    file_path = resolve_path(stem.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return range_file_response(file_path, request)


@router.get("/stem-by-type/{song_id}/{stem_type}")
def stream_stem_by_type(song_id: int, stem_type: str, request: Request, db: Session = Depends(get_db)):
    stem = db.query(Stem).filter(Stem.song_id == song_id, Stem.stem_type == stem_type).first()
    if not stem:
        raise HTTPException(status_code=404, detail="Stem not found")
    file_path = resolve_path(stem.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return range_file_response(file_path, request)


@router.get("/edit/{edit_id}")
def stream_edit(edit_id: int, request: Request, db: Session = Depends(get_db)):
    edited = db.query(EditedSong).filter(EditedSong.id == edit_id).first()
    if not edited:
        raise HTTPException(status_code=404, detail="Edited song not found")
    file_path = resolve_path(edited.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return range_file_response(file_path, request)


@router.get("/edits/{song_id}", response_model=list[EditedSongResponse])
def list_edits(song_id: int, db: Session = Depends(get_db)):
    edits = db.query(EditedSong).filter(EditedSong.original_song_id == song_id).all()
    return edits


@router.post("/edit", response_model=EditedSongResponse)
def create_edit(data: EditRequest, db: Session = Depends(get_db)):
    if data.edit_type == "trim":
        return trim_audio(db, data.song_id, data.name, data.params["start_seconds"], data.params["end_seconds"])
    elif data.edit_type == "cut_section":
        return cut_sections(db, data.song_id, data.name, data.params["sections"])
    elif data.edit_type == "vocal_mute_section":
        return vocal_mute_sections(db, data.song_id, data.name, data.params["sections"])
    else:
        raise HTTPException(status_code=400, detail=f"Unknown edit type: {data.edit_type}")


@router.delete("/edit/{edit_id}")
def delete_edit(edit_id: int, db: Session = Depends(get_db)):
    edited = db.query(EditedSong).filter(EditedSong.id == edit_id).first()
    if not edited:
        raise HTTPException(status_code=404, detail="Edited song not found")
    file_path = resolve_path(edited.file_path)
    if file_path.exists():
        file_path.unlink()
    db.delete(edited)
    db.commit()
    return {"ok": True}
