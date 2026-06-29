import asyncio
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from config import SONGS_DIR, STEMS_DIR, EDITS_DIR, SUPPORTED_FORMATS, MAX_UPLOAD_SIZE_MB
from database import get_db
from services.storage import check_storage_available
from models.song import Song, song_categories
from models.stem import Stem
from models.edit import EditedSong
from models.category import Category
from schemas.song import SongResponse, SongListResponse, SongUpdate
from services.analysis import analyze_audio_fast

router = APIRouter(prefix="/api/songs", tags=["songs"])


@router.get("", response_model=SongListResponse)
def list_songs(
    search: str = Query("", description="Search by title or artist"),
    category_id: int | None = Query(None),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_dir: str = Query("desc", description="asc or desc"),
    db: Session = Depends(get_db),
):
    query = db.query(Song).options(joinedload(Song.categories), joinedload(Song.stems))

    if search:
        pattern = f"%{search}%"
        query = query.filter((Song.title.ilike(pattern)) | (Song.artist.ilike(pattern)))

    if category_id:
        query = query.join(song_categories).filter(song_categories.c.category_id == category_id)

    sort_column = getattr(Song, sort_by, Song.created_at)
    if sort_dir == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    songs = query.all()
    # Deduplicate from joins
    seen = set()
    unique = []
    for s in songs:
        if s.id not in seen:
            seen.add(s.id)
            unique.append(s)

    return SongListResponse(songs=unique, total=len(unique))


@router.get("/{song_id}", response_model=SongResponse)
def get_song(song_id: int, db: Session = Depends(get_db)):
    song = db.query(Song).options(
        joinedload(Song.categories), joinedload(Song.stems)
    ).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
    return song


@router.post("/upload", response_model=SongResponse)
async def upload_song(
    file: UploadFile = File(...),
    title: str = Form(""),
    artist: str = Form(""),
    db: Session = Depends(get_db),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Formato no soportado: {ext}")

    # Check storage before accepting upload
    has_space, used, limit = check_storage_available()
    if not has_space:
        raise HTTPException(
            status_code=507,
            detail=f"Sin espacio: {used // (1024*1024)} MB usados de {limit // (1024*1024)} MB. Elimina canciones para liberar espacio."
        )

    import re
    safe_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', file.filename)
    safe_name = safe_name.strip('. ')[:200] or "upload"
    dest = SONGS_DIR / safe_name
    counter = 1
    base_stem = Path(safe_name).stem
    while dest.exists():
        dest = SONGS_DIR / f"{base_stem}_{counter}{ext}"
        counter += 1

    # Stream in chunks to avoid loading entire file into memory (256MB RAM limit)
    max_bytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024
    total_written = 0
    with open(dest, "wb") as f:
        while chunk := await file.read(1024 * 256):  # 256KB chunks
            total_written += len(chunk)
            if total_written > max_bytes:
                f.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=f"Archivo muy grande. Maximo: {MAX_UPLOAD_SIZE_MB} MB")
            f.write(chunk)

    # Analyze in background-ish (but we need results)
    try:
        analysis = await asyncio.to_thread(analyze_audio_fast, str(dest))
    except Exception:
        analysis = {"duration_seconds": 0, "bpm": None, "key": None, "waveform_peaks": None}

    final_title = title or dest.stem
    song = Song(
        title=final_title,
        artist=artist,
        duration_seconds=analysis["duration_seconds"],
        bpm=analysis.get("bpm"),
        key=analysis.get("key"),
        file_path=str(dest.relative_to(SONGS_DIR.parent.parent)),
        file_format=ext.lstrip("."),
        source_type="local",
        waveform_peaks=analysis.get("waveform_peaks"),
    )
    db.add(song)
    db.commit()
    db.refresh(song)
    return song


@router.put("/{song_id}", response_model=SongResponse)
def update_song(song_id: int, data: SongUpdate, db: Session = Depends(get_db)):
    song = db.query(Song).options(
        joinedload(Song.categories), joinedload(Song.stems)
    ).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    if data.title is not None:
        song.title = data.title
    if data.artist is not None:
        song.artist = data.artist
    if data.bpm is not None:
        song.bpm = data.bpm
    if data.key is not None:
        song.key = data.key
    if data.category_ids is not None:
        categories = db.query(Category).filter(Category.id.in_(data.category_ids)).all()
        song.categories = categories

    db.commit()
    db.refresh(song)
    return song


@router.delete("/{song_id}")
def delete_song(song_id: int, db: Session = Depends(get_db)):
    song = db.query(Song).options(
        joinedload(Song.stems), joinedload(Song.edited_versions)
    ).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Delete stem files from disk
    for stem in song.stems:
        stem_path = Path(stem.file_path)
        if not stem_path.is_absolute():
            stem_path = SONGS_DIR.parent.parent / stem_path
        if stem_path.exists():
            stem_path.unlink()
    # Remove stem directory for this song if it exists
    stem_dir = STEMS_DIR / str(song_id)
    if stem_dir.exists():
        shutil.rmtree(stem_dir, ignore_errors=True)

    # Delete edit files from disk
    for edit in song.edited_versions:
        edit_path = Path(edit.file_path)
        if not edit_path.is_absolute():
            edit_path = SONGS_DIR.parent.parent / edit_path
        if edit_path.exists():
            edit_path.unlink()
    # Remove edits directory for this song if it exists
    edit_dir = EDITS_DIR / str(song_id)
    if edit_dir.exists():
        shutil.rmtree(edit_dir, ignore_errors=True)

    # Delete main song file
    file_path = Path(song.file_path)
    if not file_path.is_absolute():
        file_path = SONGS_DIR.parent.parent / file_path
    if file_path.exists():
        file_path.unlink()

    db.delete(song)
    db.commit()
    return {"ok": True}
