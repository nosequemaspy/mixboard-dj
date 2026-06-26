import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from config import (
    SONGS_DIR, STEMS_DIR, EDITS_DIR, DB_DIR,
    STORAGE_LIMIT_GB, STORAGE_LIMIT_BYTES, YTDLP_AUDIO_QUALITY,
)

router = APIRouter(prefix="/api/fly", tags=["fly-monitor"])

_APP_START_TIME = time.time()

_FREE_TIER_VOLUME_GB = 3
_FREE_TIER_MAX_VMS = 3
_FREE_TIER_BANDWIDTH_GB = 160

# Average MB per song at different qualities
_AVG_MB_PER_SONG = {"128": 3.5, "192": 5.0, "256": 7.0, "320": 9.0}


def _dir_size(path) -> tuple[int, int]:
    total = 0
    count = 0
    if not path.exists():
        return 0, 0
    for f in path.rglob("*"):
        if f.is_file():
            try:
                total += f.stat().st_size
                count += 1
            except OSError:
                pass
    return total, count


@router.get("/status")
def get_fly_status():
    uptime_seconds = int(time.time() - _APP_START_TIME)

    songs_bytes, songs_count = _dir_size(SONGS_DIR)
    stems_bytes, stems_count = _dir_size(STEMS_DIR)
    edits_bytes, edits_count = _dir_size(EDITS_DIR)
    db_bytes, _ = _dir_size(DB_DIR)
    total_storage = songs_bytes + stems_bytes + edits_bytes + db_bytes

    usage_percent = round((total_storage / STORAGE_LIMIT_BYTES) * 100, 1) if STORAGE_LIMIT_BYTES > 0 else 0

    # Calculate estimated song capacity
    avg_mb = _AVG_MB_PER_SONG.get(YTDLP_AUDIO_QUALITY, 5.0)
    non_song_bytes = stems_bytes + edits_bytes + db_bytes
    available_for_songs = max(0, STORAGE_LIMIT_BYTES - non_song_bytes)
    estimated_capacity = int(available_for_songs / (avg_mb * 1024 * 1024))

    risks = []
    if usage_percent >= 90:
        risks.append("storage_critical")
    elif usage_percent >= 70:
        risks.append("storage_warning")
    if STORAGE_LIMIT_GB > _FREE_TIER_VOLUME_GB:
        risks.append("volume_exceeds_free")

    status = "danger" if any("critical" in r or "exceeds" in r for r in risks) else \
             "warning" if risks else "ok"

    is_fly = bool(os.environ.get("FLY_APP_NAME") or os.environ.get("FLY_REGION"))

    return {
        "status": status,
        "is_fly": is_fly,
        "machine": {
            "size": "shared-cpu-1x",
            "memory_mb": 256,
            "region": os.environ.get("FLY_REGION", "local"),
            "app_name": os.environ.get("FLY_APP_NAME", "mixboard-dj"),
            "auto_suspend": True,
            "uptime_seconds": uptime_seconds,
            "started_at": datetime.fromtimestamp(
                _APP_START_TIME, tz=timezone.utc
            ).isoformat(),
        },
        "storage": {
            "total_bytes": total_storage,
            "limit_bytes": STORAGE_LIMIT_BYTES,
            "volume_gb": STORAGE_LIMIT_GB,
            "usage_percent": usage_percent,
            "breakdown": {
                "songs": {"bytes": songs_bytes, "count": songs_count},
                "stems": {"bytes": stems_bytes, "count": stems_count},
                "edits": {"bytes": edits_bytes, "count": edits_count},
                "db": {"bytes": db_bytes},
            },
        },
        "capacity": {
            "audio_quality_kbps": int(YTDLP_AUDIO_QUALITY),
            "avg_song_mb": avg_mb,
            "songs_current": songs_count,
            "songs_estimated_max": estimated_capacity,
            "songs_remaining": max(0, estimated_capacity - songs_count),
        },
        "free_tier": {
            "max_vms": _FREE_TIER_MAX_VMS,
            "current_vms": 1,
            "max_volume_gb": _FREE_TIER_VOLUME_GB,
            "current_volume_gb": STORAGE_LIMIT_GB,
            "max_bandwidth_gb_month": _FREE_TIER_BANDWIDTH_GB,
        },
        "risks": risks,
    }
