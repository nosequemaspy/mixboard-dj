from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, DateTime, Text

from database import Base


class BackgroundTask(Base):
    __tablename__ = "background_tasks"

    id = Column(String(36), primary_key=True)  # UUID
    task_type = Column(String(50), nullable=False)  # download, stem_separation, analysis, edit
    status = Column(String(20), default="pending")  # pending, running, completed, failed
    progress = Column(Float, default=0.0)  # 0.0 to 1.0
    related_song_id = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
