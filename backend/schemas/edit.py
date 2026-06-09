from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TrimParams(BaseModel):
    start_seconds: float
    end_seconds: float


class CutSectionParams(BaseModel):
    sections: list[dict]  # [{"start": 10.0, "end": 20.0}, ...]


class VocalMuteSectionParams(BaseModel):
    sections: list[dict]  # [{"start": 10.0, "end": 20.0}, ...]


class EditRequest(BaseModel):
    song_id: int
    name: str
    edit_type: str  # trim, cut_section, vocal_mute_section
    params: dict


class EditedSongResponse(BaseModel):
    id: int
    original_song_id: int
    name: str
    file_path: str
    edit_type: str
    edit_metadata: str
    duration_seconds: float
    created_at: datetime

    model_config = {"from_attributes": True}
