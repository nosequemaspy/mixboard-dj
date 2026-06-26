from config import SONGS_DIR, STEMS_DIR, EDITS_DIR, DB_DIR, STORAGE_LIMIT_BYTES


def get_total_storage_bytes() -> int:
    total = 0
    for d in [SONGS_DIR, STEMS_DIR, EDITS_DIR, DB_DIR]:
        if not d.exists():
            continue
        for f in d.rglob("*"):
            if f.is_file():
                try:
                    total += f.stat().st_size
                except OSError:
                    pass
    return total


def check_storage_available(needed_bytes: int = 0) -> tuple[bool, int, int]:
    """Returns (has_space, used_bytes, limit_bytes)."""
    used = get_total_storage_bytes()
    has_space = (used + needed_bytes) < STORAGE_LIMIT_BYTES
    return has_space, used, STORAGE_LIMIT_BYTES
