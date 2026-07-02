import asyncio
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from models.task import BackgroundTask
from websocket.manager import ws_manager


async def create_task(db: Session, task_type: str, song_id: int | None = None) -> str:
    task_id = str(uuid.uuid4())
    task = BackgroundTask(
        id=task_id,
        task_type=task_type,
        status="pending",
        progress=0.0,
        related_song_id=song_id,
    )
    db.add(task)
    db.commit()
    return task_id


async def update_task_progress(db: Session, task_id: str, progress: float, status: str = "running"):
    task = db.query(BackgroundTask).filter(BackgroundTask.id == task_id).first()
    if task:
        task.progress = progress
        task.status = status
        task.updated_at = datetime.utcnow()
        db.commit()
    await ws_manager.broadcast("task_progress", {
        "task_id": task_id,
        "progress": progress,
        "status": status,
    })


async def complete_task(db: Session, task_id: str, error: str | None = None):
    task = db.query(BackgroundTask).filter(BackgroundTask.id == task_id).first()
    if task:
        task.status = "failed" if error else "completed"
        task.progress = 1.0 if not error else task.progress
        task.error_message = error
        task.updated_at = datetime.utcnow()
        db.commit()
    await ws_manager.broadcast("task_complete", {
        "task_id": task_id,
        "progress": task.progress if task else (0.0 if error else 1.0),
        "status": "failed" if error else "completed",
        "error": error,
        "song_id": task.related_song_id if task else None,
    })
