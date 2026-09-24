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
    cut_sections: Optional[str] = None


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


class PlaybackSettingsResponse(BaseModel):
    id: int
    song_id: int
    start_time: float = 0.0
    end_time: Optional[float] = None
    transition_duration: float = 4.0
    transition_type: str = "smooth"
    playback_speed: float = 1.0

    model_config = {"from_attributes": True}


class PlaybackSettingsUpdate(BaseModel):
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    transition_duration: Optional[float] = None
    transition_type: Optional[str] = None
    playback_speed: Optional[float] = None


class SongBrief(BaseModel):
    """Song without waveform_peaks — used in list and session endpoints to reduce payload."""
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
    cut_sections: Optional[str] = None
    created_at: datetime
    categories: list[CategoryInSong] = []
    stems: list[StemInSong] = []
    playback_settings: Optional[PlaybackSettingsResponse] = None

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
    cut_sections: Optional[str] = None
    created_at: datetime
    categories: list[CategoryInSong] = []
    stems: list[StemInSong] = []
    playback_settings: Optional[PlaybackSettingsResponse] = None

    model_config = {"from_attributes": True}


class SongBriefListResponse(BaseModel):
    songs: list[SongBrief]
    total: int


class SongListResponse(BaseModel):
    songs: list[SongResponse]
    total: int
