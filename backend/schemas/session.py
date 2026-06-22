from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel

from schemas.song import SongResponse


# --- Session ---

class SessionCreate(BaseModel):
    name: str
    password: Optional[str] = None
    is_public: bool = False
    allow_suggestions: bool = True


class SessionUpdate(BaseModel):
    name: Optional[str] = None
    is_public: Optional[bool] = None
    allow_suggestions: Optional[bool] = None


class SessionDuplicate(BaseModel):
    name: str
    password: Optional[str] = None
    is_public: bool = True


class SessionVerify(BaseModel):
    password: str


class SessionItemResponse(BaseModel):
    id: int
    session_id: int
    song_id: int
    position: int
    is_played: bool
    played_at: Optional[datetime]
    added_by: str
    notes: str
    song: SongResponse

    model_config = {"from_attributes": True}


class SuggestionResponse(BaseModel):
    id: int
    session_id: int
    suggestion_type: str
    youtube_url: Optional[str]
    youtube_title: Optional[str]
    youtube_thumbnail: Optional[str]
    manual_title: Optional[str]
    manual_artist: Optional[str]
    status: str
    submitted_by: str
    created_at: datetime
    reviewed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: int
    name: str
    share_code: str
    has_password: bool = False
    is_public: bool
    allow_suggestions: bool
    parent_session_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    items: list[SessionItemResponse] = []
    suggestions: list[SuggestionResponse] = []
    notes: list["NoteResponse"] = []

    model_config = {"from_attributes": True}


class SessionListResponse(BaseModel):
    id: int
    name: str
    share_code: str
    has_password: bool = False
    is_public: bool
    allow_suggestions: bool
    parent_session_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    pending_suggestions: int = 0

    model_config = {"from_attributes": True}


# --- Session Items ---

class SessionItemCreate(BaseModel):
    song_id: int
    position: Optional[int] = None
    notes: str = ""


class SessionItemUpdate(BaseModel):
    position: Optional[int] = None
    is_played: Optional[bool] = None
    notes: Optional[str] = None


# --- Suggestions ---

class SuggestionCreate(BaseModel):
    suggestion_type: Literal["youtube", "manual"] = "manual"
    youtube_url: Optional[str] = None
    youtube_title: Optional[str] = None
    youtube_thumbnail: Optional[str] = None
    manual_title: Optional[str] = None
    manual_artist: Optional[str] = None
    submitted_by: str = "anonymous"


class SuggestionUpdate(BaseModel):
    status: Literal["approved", "rejected"]


# --- Notes ---

class NoteCreate(BaseModel):
    content: str
    author_name: str = "anonymous"


class NoteResponse(BaseModel):
    id: int
    session_id: int
    content: str
    author_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
