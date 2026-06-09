from datetime import datetime

from pydantic import BaseModel


class StemSeparationRequest(BaseModel):
    song_id: int


class StemResponse(BaseModel):
    id: int
    song_id: int
    stem_type: str
    file_path: str
    model_used: str
    created_at: datetime

    model_config = {"from_attributes": True}
