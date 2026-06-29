from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.stem import Stem
from models.song import Song
from schemas.stem import StemResponse, StemSeparationRequest
from services.stem_service import separate_stems

router = APIRouter(prefix="/api/stems", tags=["stems"])


@router.get("/{song_id}", response_model=list[StemResponse])
def get_stems(song_id: int, db: Session = Depends(get_db)):
    stems = db.query(Stem).filter(Stem.song_id == song_id).all()
    return stems


@router.post("/separate")
async def start_separation(data: StemSeparationRequest, db: Session = Depends(get_db)):
    song = db.query(Song).filter(Song.id == data.song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Reset stuck "processing" status (ffmpeg takes seconds, not minutes)
    if song.stems_status == "processing":
        song.stems_status = "none"
        db.commit()

    task_id = await separate_stems(db, data.song_id)
    return {"task_id": task_id, "status": "started"}
