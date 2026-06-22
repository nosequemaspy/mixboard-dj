from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
import bcrypt
import httpx

from database import get_db
from models.session import Session as SessionModel, SessionItem, SessionFolder, SessionSuggestion, SessionNote, generate_share_code
from models.song import Song
from schemas.session import (
    SessionCreate, SessionUpdate, SessionDuplicate, SessionVerify,
    SessionResponse, SessionListResponse,
    SessionItemCreate, SessionItemUpdate, SessionItemResponse,
    SessionFolderCreate, SessionFolderUpdate, SessionFolderResponse,
    SuggestionCreate, SuggestionUpdate, SuggestionResponse,
    NoteCreate, NoteResponse,
)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def _check_password(session: SessionModel, password: Optional[str]):
    if session.password_hash:
        if not password:
            raise HTTPException(status_code=401, detail="Password required")
        if not _verify_password(password, session.password_hash):
            raise HTTPException(status_code=403, detail="Invalid password")


def _load_session(db: Session, session_id: int) -> SessionModel:
    session = db.query(SessionModel).options(
        joinedload(SessionModel.items).joinedload(SessionItem.song).joinedload(Song.categories),
        joinedload(SessionModel.items).joinedload(SessionItem.song).joinedload(Song.stems),
        joinedload(SessionModel.folders),
        joinedload(SessionModel.suggestions),
        joinedload(SessionModel.notes),
    ).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _session_to_response(session: SessionModel) -> SessionModel:
    # Deduplicate items from joins
    seen = set()
    unique_items = []
    for item in session.items:
        if item.id not in seen:
            seen.add(item.id)
            unique_items.append(item)
    session.items = sorted(unique_items, key=lambda i: i.position)
    return session


# --- Session CRUD ---

@router.post("", response_model=SessionResponse)
def create_session(data: SessionCreate, db: Session = Depends(get_db)):
    for _ in range(5):
        session = SessionModel(
            name=data.name,
            share_code=generate_share_code(),
            password_hash=_hash_password(data.password) if data.password else None,
            is_public=data.is_public,
            allow_suggestions=data.allow_suggestions,
        )
        db.add(session)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            continue
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique share code")
    db.refresh(session)
    session.has_password = session.password_hash is not None
    return session


@router.get("", response_model=list[SessionListResponse])
def list_sessions(db: Session = Depends(get_db)):
    sessions = db.query(SessionModel).order_by(SessionModel.created_at.desc()).all()
    result = []
    for s in sessions:
        item_count = db.query(SessionItem).filter(SessionItem.session_id == s.id).count()
        pending = db.query(SessionSuggestion).filter(
            SessionSuggestion.session_id == s.id,
            SessionSuggestion.status == "pending",
        ).count()
        result.append(SessionListResponse(
            id=s.id,
            name=s.name,
            share_code=s.share_code,
            has_password=s.password_hash is not None,
            is_public=s.is_public,
            allow_suggestions=s.allow_suggestions,
            parent_session_id=s.parent_session_id,
            created_at=s.created_at,
            updated_at=s.updated_at,
            item_count=item_count,
            pending_suggestions=pending,
        ))
    return result


@router.get("/by-code/{code}", response_model=SessionResponse)
def get_session_by_code(
    code: str,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).options(
        joinedload(SessionModel.items).joinedload(SessionItem.song).joinedload(Song.categories),
        joinedload(SessionModel.items).joinedload(SessionItem.song).joinedload(Song.stems),
        joinedload(SessionModel.folders),
        joinedload(SessionModel.suggestions),
        joinedload(SessionModel.notes),
    ).filter(SessionModel.share_code == code).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session = _session_to_response(session)
    session.has_password = session.password_hash is not None
    # If session has password and no valid password provided, hide items/suggestions
    if session.password_hash and not (x_session_password and _verify_password(x_session_password, session.password_hash)):
        session.items = []
        session.suggestions = []
    return session


@router.post("/{session_id}/verify")
def verify_password(session_id: int, data: SessionVerify, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.password_hash:
        return {"ok": True}
    if _verify_password(data.password, session.password_hash):
        return {"ok": True}
    raise HTTPException(status_code=403, detail="Invalid password")


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = _load_session(db, session_id)
    session = _session_to_response(session)
    session.has_password = session.password_hash is not None
    # If session has password and no valid password provided, hide items/suggestions
    if session.password_hash and not (x_session_password and _verify_password(x_session_password, session.password_hash)):
        session.items = []
        session.suggestions = []
    return session


@router.put("/{session_id}", response_model=SessionResponse)
def update_session(
    session_id: int,
    data: SessionUpdate,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = _load_session(db, session_id)
    _check_password(session, x_session_password)
    if data.name is not None:
        session.name = data.name
    if data.is_public is not None:
        session.is_public = data.is_public
    if data.allow_suggestions is not None:
        session.allow_suggestions = data.allow_suggestions
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    session = _load_session(db, session_id)
    session = _session_to_response(session)
    session.has_password = session.password_hash is not None
    return session


@router.delete("/{session_id}")
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.post("/{session_id}/duplicate", response_model=SessionResponse)
def duplicate_session(
    session_id: int,
    data: SessionDuplicate,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    original = _load_session(db, session_id)
    _check_password(original, x_session_password)

    for _ in range(5):
        new_session = SessionModel(
            name=data.name,
            share_code=generate_share_code(),
            password_hash=_hash_password(data.password) if data.password else None,
            is_public=data.is_public,
            allow_suggestions=original.allow_suggestions,
            parent_session_id=original.id,
        )
        db.add(new_session)
        try:
            db.commit()
            break
        except IntegrityError:
            db.rollback()
            continue
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique share code")
    db.refresh(new_session)

    # Copy folders
    folder_map = {}  # old_folder_id -> new_folder_id
    for folder in original.folders:
        new_folder = SessionFolder(
            session_id=new_session.id,
            name=folder.name,
            color=folder.color,
            position=folder.position,
        )
        db.add(new_folder)
        db.flush()
        folder_map[folder.id] = new_folder.id

    # Copy items
    for item in original.items:
        new_item = SessionItem(
            session_id=new_session.id,
            song_id=item.song_id,
            position=item.position,
            folder_id=folder_map.get(item.folder_id) if item.folder_id else None,
            folder_position=item.folder_position,
            is_played=False,
            added_by=item.added_by,
            notes=item.notes,
        )
        db.add(new_item)
    db.commit()

    new_session = _load_session(db, new_session.id)
    new_session = _session_to_response(new_session)
    new_session.has_password = new_session.password_hash is not None
    return new_session


# --- Session Items ---

@router.get("/{session_id}/items", response_model=list[SessionItemResponse])
def list_items(session_id: int, db: Session = Depends(get_db)):
    items = db.query(SessionItem).options(
        joinedload(SessionItem.song).joinedload(Song.categories),
        joinedload(SessionItem.song).joinedload(Song.stems),
    ).filter(SessionItem.session_id == session_id).order_by(SessionItem.position).all()
    return items


@router.post("/{session_id}/items", response_model=SessionItemResponse)
def add_item(
    session_id: int,
    data: SessionItemCreate,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    song = db.query(Song).filter(Song.id == data.song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    if data.position is None:
        max_pos = db.query(SessionItem).filter(SessionItem.session_id == session_id).count()
        data.position = max_pos

    item = SessionItem(
        session_id=session_id,
        song_id=data.song_id,
        position=data.position,
        notes=data.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    item = db.query(SessionItem).options(
        joinedload(SessionItem.song).joinedload(Song.categories),
        joinedload(SessionItem.song).joinedload(Song.stems),
    ).filter(SessionItem.id == item.id).first()
    return item


@router.put("/{session_id}/items/{item_id}", response_model=SessionItemResponse)
def update_item(
    session_id: int,
    item_id: int,
    data: SessionItemUpdate,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    item = db.query(SessionItem).filter(
        SessionItem.id == item_id, SessionItem.session_id == session_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if data.position is not None:
        item.position = data.position
    if data.is_played is not None:
        item.is_played = data.is_played
        item.played_at = datetime.utcnow() if data.is_played else None
    if data.notes is not None:
        item.notes = data.notes
    db.commit()
    db.refresh(item)

    item = db.query(SessionItem).options(
        joinedload(SessionItem.song).joinedload(Song.categories),
        joinedload(SessionItem.song).joinedload(Song.stems),
    ).filter(SessionItem.id == item.id).first()
    return item


@router.delete("/{session_id}/items/{item_id}")
def remove_item(
    session_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    item = db.query(SessionItem).filter(
        SessionItem.id == item_id, SessionItem.session_id == session_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.put("/{session_id}/reorder")
def reorder_items(
    session_id: int,
    item_ids: list[int],
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    for position, item_id in enumerate(item_ids):
        item = db.query(SessionItem).filter(
            SessionItem.id == item_id, SessionItem.session_id == session_id
        ).first()
        if item:
            item.position = position
    db.commit()
    return {"ok": True}


# --- Folders ---

@router.get("/{session_id}/folders", response_model=list[SessionFolderResponse])
def list_folders(session_id: int, db: Session = Depends(get_db)):
    folders = db.query(SessionFolder).filter(
        SessionFolder.session_id == session_id
    ).order_by(SessionFolder.position).all()
    return folders


@router.post("/{session_id}/folders", response_model=SessionFolderResponse)
def create_folder(
    session_id: int,
    data: SessionFolderCreate,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    max_pos = db.query(SessionFolder).filter(SessionFolder.session_id == session_id).count()
    folder = SessionFolder(
        session_id=session_id,
        name=data.name,
        color=data.color,
        position=max_pos,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


@router.put("/{session_id}/folders/{folder_id}", response_model=SessionFolderResponse)
def update_folder(
    session_id: int,
    folder_id: int,
    data: SessionFolderUpdate,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    folder = db.query(SessionFolder).filter(
        SessionFolder.id == folder_id, SessionFolder.session_id == session_id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    if data.name is not None:
        folder.name = data.name
    if data.color is not None:
        folder.color = data.color
    db.commit()
    db.refresh(folder)
    return folder


@router.delete("/{session_id}/folders/{folder_id}")
def delete_folder(
    session_id: int,
    folder_id: int,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    folder = db.query(SessionFolder).filter(
        SessionFolder.id == folder_id, SessionFolder.session_id == session_id
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    # Items with this folder_id will have folder_id set to NULL by ondelete="SET NULL"
    db.delete(folder)
    db.commit()
    return {"ok": True}


@router.put("/{session_id}/folders/reorder")
def reorder_folders(
    session_id: int,
    folder_ids: list[int],
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    for position, folder_id in enumerate(folder_ids):
        folder = db.query(SessionFolder).filter(
            SessionFolder.id == folder_id, SessionFolder.session_id == session_id
        ).first()
        if folder:
            folder.position = position
    db.commit()
    return {"ok": True}


@router.put("/{session_id}/items/{item_id}/assign-folder")
def assign_item_folder(
    session_id: int,
    item_id: int,
    data: dict,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    item = db.query(SessionItem).filter(
        SessionItem.id == item_id, SessionItem.session_id == session_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    folder_id = data.get("folder_id")
    if folder_id is not None:
        folder = db.query(SessionFolder).filter(
            SessionFolder.id == folder_id, SessionFolder.session_id == session_id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        # Set folder_position to end of folder
        max_pos = db.query(SessionItem).filter(
            SessionItem.folder_id == folder_id
        ).count()
        item.folder_id = folder_id
        item.folder_position = max_pos
    else:
        item.folder_id = None
        item.folder_position = None

    db.commit()
    return {"ok": True}


@router.put("/{session_id}/folders/{folder_id}/reorder")
def reorder_folder_items(
    session_id: int,
    folder_id: int,
    item_ids: list[int],
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    for position, item_id in enumerate(item_ids):
        item = db.query(SessionItem).filter(
            SessionItem.id == item_id,
            SessionItem.session_id == session_id,
            SessionItem.folder_id == folder_id,
        ).first()
        if item:
            item.folder_position = position
    db.commit()
    return {"ok": True}


# --- Suggestions ---

@router.get("/{session_id}/suggestions", response_model=list[SuggestionResponse])
def list_suggestions(session_id: int, db: Session = Depends(get_db)):
    suggestions = db.query(SessionSuggestion).filter(
        SessionSuggestion.session_id == session_id
    ).order_by(SessionSuggestion.created_at.desc()).all()
    return suggestions


@router.post("/{session_id}/suggestions", response_model=SuggestionResponse)
def create_suggestion(session_id: int, data: SuggestionCreate, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.allow_suggestions:
        raise HTTPException(status_code=403, detail="Suggestions are not allowed for this session")

    suggestion = SessionSuggestion(
        session_id=session_id,
        suggestion_type=data.suggestion_type,
        youtube_url=data.youtube_url,
        youtube_title=data.youtube_title,
        youtube_thumbnail=data.youtube_thumbnail,
        manual_title=data.manual_title,
        manual_artist=data.manual_artist,
        submitted_by=data.submitted_by,
    )
    db.add(suggestion)
    db.commit()
    db.refresh(suggestion)
    return suggestion


@router.put("/{session_id}/suggestions/{suggestion_id}", response_model=SuggestionResponse)
def update_suggestion(
    session_id: int,
    suggestion_id: int,
    data: SuggestionUpdate,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    suggestion = db.query(SessionSuggestion).filter(
        SessionSuggestion.id == suggestion_id,
        SessionSuggestion.session_id == session_id,
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    suggestion.status = data.status
    suggestion.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(suggestion)
    return suggestion


@router.delete("/{session_id}/suggestions/{suggestion_id}")
def delete_suggestion(
    session_id: int,
    suggestion_id: int,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    suggestion = db.query(SessionSuggestion).filter(
        SessionSuggestion.id == suggestion_id,
        SessionSuggestion.session_id == session_id,
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    db.delete(suggestion)
    db.commit()
    return {"ok": True}


# --- Notes ---

@router.get("/{session_id}/notes", response_model=list[NoteResponse])
def list_notes(session_id: int, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    notes = db.query(SessionNote).filter(
        SessionNote.session_id == session_id
    ).order_by(SessionNote.created_at.desc()).all()
    return notes


@router.post("/{session_id}/notes", response_model=NoteResponse)
def create_note(session_id: int, data: NoteCreate, db: Session = Depends(get_db)):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    note = SessionNote(
        session_id=session_id,
        content=data.content,
        author_name=data.author_name or "anonymous",
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{session_id}/notes/{note_id}")
def delete_note(
    session_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    x_session_password: Optional[str] = Header(None),
):
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _check_password(session, x_session_password)

    note = db.query(SessionNote).filter(
        SessionNote.id == note_id,
        SessionNote.session_id == session_id,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
    return {"ok": True}


# --- YouTube oEmbed proxy ---

youtube_router = APIRouter(prefix="/api/youtube", tags=["youtube"])


@youtube_router.get("/oembed")
async def youtube_oembed(url: str = Query(...)):
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://www.youtube.com/oembed",
                params={"url": url, "format": "json"},
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json()
            raise HTTPException(status_code=resp.status_code, detail="YouTube oEmbed failed")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach YouTube")
