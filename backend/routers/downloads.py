from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models.task import BackgroundTask
from schemas.download import DownloadRequest, DownloadPreview
from services.download_service import get_video_info, download_from_youtube

router = APIRouter(prefix="/api/downloads", tags=["downloads"])


@router.post("/preview", response_model=DownloadPreview)
async def preview_download(data: DownloadRequest):
    try:
        info = await get_video_info(data.url)
        return DownloadPreview(**info)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/start")
async def start_download(data: DownloadRequest, db: Session = Depends(get_db)):
    try:
        task_id = await download_from_youtube(db, data.url, data.title, data.artist)
        return {"task_id": task_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/tasks")
async def get_active_tasks(db: Session = Depends(get_db)):
    # Clean up stale tasks (stuck running/pending for over 10 minutes)
    cutoff = datetime.utcnow() - timedelta(minutes=10)
    stale = db.query(BackgroundTask).filter(
        BackgroundTask.status.in_(["pending", "running"]),
        BackgroundTask.updated_at < cutoff,
    ).all()
    for t in stale:
        t.status = "failed"
        t.error_message = "Timed out"
    if stale:
        db.commit()

    tasks = db.query(BackgroundTask).filter(
        BackgroundTask.status.in_(["pending", "running"])
    ).all()
    return [
        {
            "task_id": t.id,
            "progress": t.progress,
            "status": t.status,
            "error": t.error_message,
            "song_id": t.related_song_id,
        }
        for t in tasks
    ]
