from typing import Optional
from datetime import datetime

from pydantic import BaseModel


class SettingsUpdate(BaseModel):
    master_device_id: Optional[str] = None
    headphone_device_id: Optional[str] = None
    master_volume: Optional[float] = None
    headphone_volume: Optional[float] = None
    headphone_cue_mix: Optional[float] = None
    cue_a: Optional[bool] = None
    cue_b: Optional[bool] = None
    crossfader_curve: Optional[str] = None
    midi_mappings: Optional[str] = None


class SettingsResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    master_device_id: str
    headphone_device_id: str
    master_volume: float
    headphone_volume: float
    headphone_cue_mix: float
    cue_a: bool
    cue_b: bool
    crossfader_curve: str
    midi_mappings: Optional[str] = None
    updated_at: Optional[datetime] = None
