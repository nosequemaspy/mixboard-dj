import asyncio
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from config import SONGS_DIR, SUPPORTED_FORMATS
from database import get_db
from models.song import Song, song_categories
from models.category import Category
from schemas.song import SongResponse, SongListResponse, SongUpdate
from services.analysis import analyze_audio

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
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    safe_name = file.filename.replace("/", "_").replace("\\", "_")
    dest = SONGS_DIR / safe_name
    counter = 1
    while dest.exists():
        stem = dest.stem
        dest = SONGS_DIR / f"{stem}_{counter}{ext}"
        counter += 1

    with open(dest, "wb") as f:
        content = await file.read()
        f.write(content)

    # Analyze in background-ish (but we need results)
    try:
        analysis = await asyncio.to_thread(analyze_audio, str(dest))
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
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Delete file
    file_path = Path(song.file_path)
    if not file_path.is_absolute():
        file_path = SONGS_DIR.parent.parent / file_path
    if file_path.exists():
        file_path.unlink()

    db.delete(song)
    db.commit()
    return {"ok": True}
