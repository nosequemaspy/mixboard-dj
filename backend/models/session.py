from datetime import datetime
import secrets
import string

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


def generate_share_code(length=8):
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False)
    share_code = Column(String(8), unique=True, index=True, default=generate_share_code)
    password_hash = Column(String(256), nullable=True)
    is_public = Column(Boolean, default=False)
    allow_suggestions = Column(Boolean, default=True)
    parent_session_id = Column(Integer, ForeignKey("sessions.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship("SessionItem", back_populates="session", cascade="all, delete-orphan",
                         order_by="SessionItem.position")
    folders = relationship("SessionFolder", back_populates="session", cascade="all, delete-orphan",
                           order_by="SessionFolder.position")
    suggestions = relationship("SessionSuggestion", back_populates="session", cascade="all, delete-orphan",
                               order_by="SessionSuggestion.created_at.desc()")
    notes = relationship("SessionNote", back_populates="session", cascade="all, delete-orphan",
                         order_by="SessionNote.created_at.desc()")
    parent = relationship("Session", remote_side=[id], backref="duplicates")


class SessionFolder(Base):
    __tablename__ = "session_folders"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    color = Column(String(7), nullable=False, default="#6366f1")
    position = Column(Integer, nullable=False, default=0)

    session = relationship("Session", back_populates="folders")
    items = relationship("SessionItem", back_populates="folder")


class SessionItem(Base):
    __tablename__ = "session_items"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    song_id = Column(Integer, ForeignKey("songs.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    folder_id = Column(Integer, ForeignKey("session_folders.id", ondelete="SET NULL"), nullable=True)
    folder_position = Column(Integer, nullable=True)
    is_played = Column(Boolean, default=False)
    played_at = Column(DateTime, nullable=True)
    added_by = Column(String(200), default="dj")
    notes = Column(String(500), default="")

    session = relationship("Session", back_populates="items")
    song = relationship("Song")
    folder = relationship("SessionFolder", back_populates="items")


class SessionSuggestion(Base):
    __tablename__ = "session_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    suggestion_type = Column(String(20), default="manual")  # youtube, manual
    youtube_url = Column(String(2000), nullable=True)
    youtube_title = Column(String(500), nullable=True)
    youtube_thumbnail = Column(String(2000), nullable=True)
    manual_title = Column(String(500), nullable=True)
    manual_artist = Column(String(500), nullable=True)
    status = Column(String(20), default="pending")  # pending, approved, rejected
    submitted_by = Column(String(200), default="anonymous")
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    session = relationship("Session", back_populates="suggestions")


class SessionNote(Base):
    __tablename__ = "session_notes"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    author_name = Column(String(200), default="anonymous")
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="notes")
