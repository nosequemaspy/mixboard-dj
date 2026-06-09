from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, Date, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Playlist(Base):
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False)
    description = Column(Text, default="")
    event_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("PlaylistItem", back_populates="playlist", cascade="all, delete-orphan",
                         order_by="PlaylistItem.position")


class PlaylistItem(Base):
    __tablename__ = "playlist_items"

    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    is_played = Column(Boolean, default=False)
    played_at = Column(DateTime, nullable=True)
    notes = Column(String(500), default="")

    playlist = relationship("Playlist", back_populates="items")
    song = relationship("Song", back_populates="playlist_items")
