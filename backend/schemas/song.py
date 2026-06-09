from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SongCreate(BaseModel):
    title: str
    artist: str = ""
    source_url: Optional[str] = None
    source_type: str = "local"


class SongUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    bpm: Optional[float] = None
    key: Optional[str] = None
    category_ids: Optional[list[int]] = None


class CategoryInSong(BaseModel):
    id: int
    name: str
    color: str

    model_config = {"from_attributes": True}


class StemInSong(BaseModel):
    id: int
    stem_type: str
    file_path: str

    model_config = {"from_attributes": True}


class SongResponse(BaseModel):
    id: int
    title: str
    artist: str
    duration_seconds: float
    bpm: Optional[float]
    key: Optional[str]
    file_path: str
    file_format: str
    source_url: Optional[str]
    source_type: str
    stems_status: str
    waveform_peaks: Optional[str]
    created_at: datetime
    categories: list[CategoryInSong] = []
    stems: list[StemInSong] = []

    model_config = {"from_attributes": True}


class SongListResponse(BaseModel):
    songs: list[SongResponse]
    total: int
