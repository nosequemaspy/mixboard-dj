from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from database import Base
from models.song import song_categories


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    color = Column(String(7), default="#6366f1")  # hex color
    sort_order = Column(Integer, default=0)

    songs = relationship("Song", secondary=song_categories, back_populates="categories")
