from sqlalchemy import Column, Integer, Float, String, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class SongPlaybackSettings(Base):
    __tablename__ = "song_playback_settings"

    id = Column(Integer, primary_key=True, index=True)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), unique=True, nullable=False)
    start_time = Column(Float, default=0.0)
    end_time = Column(Float, nullable=True)
    transition_duration = Column(Float, default=4.0)
    transition_type = Column(String(20), default="smooth")
    playback_speed = Column(Float, default=1.0)

    song = relationship("Song", back_populates="playback_settings")
