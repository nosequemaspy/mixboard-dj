from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from config import SONGS_DIR, STEMS_DIR, EDITS_DIR, DB_DIR, STORAGE_LIMIT_BYTES
from database import get_db
from models.settings import UserSettings
from schemas.settings import SettingsResponse, SettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _get_or_create(db: Session) -> UserSettings:
    settings = db.query(UserSettings).filter(UserSettings.id == 1).first()
    if not settings:
        settings = UserSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("", response_model=SettingsResponse)
def get_settings(db: Session = Depends(get_db)):
    return _get_or_create(db)


def _dir_size(path) -> tuple[int, int]:
    """Returns (total_bytes, file_count) for a directory."""
    total = 0
    count = 0
    for f in path.rglob("*"):
        if f.is_file():
            total += f.stat().st_size
            count += 1
    return total, count


@router.get("/storage")
def get_storage_usage():
    songs_bytes, songs_count = _dir_size(SONGS_DIR)
    stems_bytes, stems_count = _dir_size(STEMS_DIR)
    edits_bytes, edits_count = _dir_size(EDITS_DIR)
    db_bytes, _ = _dir_size(DB_DIR)
    total = songs_bytes + stems_bytes + edits_bytes + db_bytes
    return {
        "total_bytes": total,
        "limit_bytes": STORAGE_LIMIT_BYTES,
        "usage_percent": round((total / STORAGE_LIMIT_BYTES) * 100, 1) if STORAGE_LIMIT_BYTES > 0 else 0,
        "songs": {"bytes": songs_bytes, "count": songs_count},
        "stems": {"bytes": stems_bytes, "count": stems_count},
        "edits": {"bytes": edits_bytes, "count": edits_count},
        "db": {"bytes": db_bytes},
    }


@router.put("", response_model=SettingsResponse)
def update_settings(data: SettingsUpdate, db: Session = Depends(get_db)):
    settings = _get_or_create(db)
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings
