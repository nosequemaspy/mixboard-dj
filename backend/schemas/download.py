from typing import Optional

from pydantic import BaseModel


class DownloadRequest(BaseModel):
    url: str
    title: Optional[str] = None
    artist: Optional[str] = None


class DownloadPreview(BaseModel):
    title: str
    artist: str
    duration_seconds: float
    thumbnail_url: Optional[str] = None
    url: str
