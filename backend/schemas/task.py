from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TaskResponse(BaseModel):
    id: str
    task_type: str
    status: str
    progress: float
    related_song_id: Optional[int]
    error_message: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
