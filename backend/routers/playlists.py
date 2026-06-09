from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models.playlist import Playlist, PlaylistItem
from models.song import Song
from schemas.playlist import (
    PlaylistCreate, PlaylistUpdate, PlaylistResponse,
    PlaylistItemCreate, PlaylistItemUpdate, PlaylistItemResponse,
)

router = APIRouter(prefix="/api/playlists", tags=["playlists"])


@router.get("", response_model=list[PlaylistResponse])
def list_playlists(db: Session = Depends(get_db)):
    playlists = db.query(Playlist).options(
        joinedload(Playlist.items).joinedload(PlaylistItem.song).joinedload(Song.categories),
        joinedload(Playlist.items).joinedload(PlaylistItem.song).joinedload(Song.stems),
    ).order_by(Playlist.created_at.desc()).all()
    # Deduplicate items within each playlist
    for p in playlists:
        seen = set()
        unique_items = []
        for item in p.items:
            if item.id not in seen:
                seen.add(item.id)
                unique_items.append(item)
        p.items = sorted(unique_items, key=lambda i: i.position)
    return playlists


@router.get("/{playlist_id}", response_model=PlaylistResponse)
def get_playlist(playlist_id: int, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).options(
        joinedload(Playlist.items).joinedload(PlaylistItem.song).joinedload(Song.categories),
        joinedload(Playlist.items).joinedload(PlaylistItem.song).joinedload(Song.stems),
    ).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist


@router.post("", response_model=PlaylistResponse)
def create_playlist(data: PlaylistCreate, db: Session = Depends(get_db)):
    playlist = Playlist(name=data.name, description=data.description, event_date=data.event_date)
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist


@router.put("/{playlist_id}", response_model=PlaylistResponse)
def update_playlist(playlist_id: int, data: PlaylistUpdate, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if data.name is not None:
        playlist.name = data.name
    if data.description is not None:
        playlist.description = data.description
    if data.event_date is not None:
        playlist.event_date = data.event_date
    if data.is_active is not None:
        playlist.is_active = data.is_active
    db.commit()
    db.refresh(playlist)
    return playlist


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: int, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    db.delete(playlist)
    db.commit()
    return {"ok": True}


# --- Playlist Items ---

@router.post("/{playlist_id}/items", response_model=PlaylistItemResponse)
def add_item(playlist_id: int, data: PlaylistItemCreate, db: Session = Depends(get_db)):
    playlist = db.query(Playlist).filter(Playlist.id == playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    song = db.query(Song).filter(Song.id == data.song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")

    # Auto position
    if data.position is None:
        max_pos = db.query(PlaylistItem).filter(
            PlaylistItem.playlist_id == playlist_id
        ).count()
        data.position = max_pos

    item = PlaylistItem(
        playlist_id=playlist_id,
        song_id=data.song_id,
        position=data.position,
        notes=data.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    # Reload with song relation
    item = db.query(PlaylistItem).options(
        joinedload(PlaylistItem.song).joinedload(Song.categories),
        joinedload(PlaylistItem.song).joinedload(Song.stems),
    ).filter(PlaylistItem.id == item.id).first()
    return item


@router.put("/{playlist_id}/items/{item_id}", response_model=PlaylistItemResponse)
def update_item(playlist_id: int, item_id: int, data: PlaylistItemUpdate, db: Session = Depends(get_db)):
    item = db.query(PlaylistItem).filter(
        PlaylistItem.id == item_id, PlaylistItem.playlist_id == playlist_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if data.position is not None:
        item.position = data.position
    if data.is_played is not None:
        item.is_played = data.is_played
        if data.is_played:
            item.played_at = datetime.utcnow()
    if data.notes is not None:
        item.notes = data.notes
    db.commit()
    db.refresh(item)
    item = db.query(PlaylistItem).options(
        joinedload(PlaylistItem.song).joinedload(Song.categories),
        joinedload(PlaylistItem.song).joinedload(Song.stems),
    ).filter(PlaylistItem.id == item.id).first()
    return item


@router.delete("/{playlist_id}/items/{item_id}")
def remove_item(playlist_id: int, item_id: int, db: Session = Depends(get_db)):
    item = db.query(PlaylistItem).filter(
        PlaylistItem.id == item_id, PlaylistItem.playlist_id == playlist_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.put("/{playlist_id}/reorder")
def reorder_items(playlist_id: int, item_ids: list[int], db: Session = Depends(get_db)):
    for position, item_id in enumerate(item_ids):
        item = db.query(PlaylistItem).filter(
            PlaylistItem.id == item_id, PlaylistItem.playlist_id == playlist_id
        ).first()
        if item:
            item.position = position
    db.commit()
    return {"ok": True}
