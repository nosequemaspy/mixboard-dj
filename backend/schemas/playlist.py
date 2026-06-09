from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel

from schemas.song import SongResponse


class PlaylistItemCreate(BaseModel):
    song_id: int
    position: Optional[int] = None
    notes: str = ""


class PlaylistItemUpdate(BaseModel):
    position: Optional[int] = None
    is_played: Optional[bool] = None
    notes: Optional[str] = None


class PlaylistItemResponse(BaseModel):
    id: int
    playlist_id: int
    song_id: int
    position: int
    is_played: bool
    played_at: Optional[datetime]
    notes: str
    song: SongResponse

    model_config = {"from_attributes": True}


class PlaylistCreate(BaseModel):
    name: str
    description: str = ""
    event_date: Optional[date] = None


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    event_date: Optional[date] = None
    is_active: Optional[bool] = None


class PlaylistResponse(BaseModel):
    id: int
    name: str
    description: str
    event_date: Optional[date]
    is_active: bool
    created_at: datetime
    items: list[PlaylistItemResponse] = []

    model_config = {"from_attributes": True}
