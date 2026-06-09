from datetime import datetime

from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Table, ForeignKey
from sqlalchemy.orm import relationship

from database import Base

song_categories = Table(
    "song_categories",
    Base.metadata,
    Column("song_id", Integer, ForeignKey("songs.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)


# Alias for import compatibility
SongCategory = song_categories


class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    artist = Column(String(500), default="")
    duration_seconds = Column(Float, default=0.0)
    bpm = Column(Float, nullable=True)
    key = Column(String(10), nullable=True)
    file_path = Column(String(1000), nullable=False)
    file_format = Column(String(10), default="mp3")
    source_url = Column(String(2000), nullable=True)
    source_type = Column(String(20), default="local")  # local, youtube
    stems_status = Column(String(20), default="none")  # none, processing, ready, error
    waveform_peaks = Column(Text, nullable=True)  # JSON array of peaks
    created_at = Column(DateTime, default=datetime.utcnow)

    categories = relationship("Category", secondary=song_categories, back_populates="songs")
    stems = relationship("Stem", back_populates="song", cascade="all, delete-orphan")
    playlist_items = relationship("PlaylistItem", back_populates="song", cascade="all, delete-orphan")
    edited_versions = relationship("EditedSong", back_populates="original_song", cascade="all, delete-orphan")
