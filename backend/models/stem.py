from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Stem(Base):
    __tablename__ = "stems"

    id = Column(Integer, primary_key=True, index=True)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    stem_type = Column(String(20), nullable=False)  # vocals, drums, bass, other, instrumental
    file_path = Column(String(1000), nullable=False)
    model_used = Column(String(50), default="htdemucs")
    created_at = Column(DateTime, default=datetime.utcnow)

    song = relationship("Song", back_populates="stems")
