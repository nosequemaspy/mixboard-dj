from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class EditedSong(Base):
    __tablename__ = "edited_songs"

    id = Column(Integer, primary_key=True, index=True)
    original_song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    edit_type = Column(String(50), nullable=False)  # trim, cut_section, vocal_mute_section
    edit_metadata = Column(Text, default="{}")  # JSON
    duration_seconds = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    original_song = relationship("Song", back_populates="edited_versions")
