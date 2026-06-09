import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
SONGS_DIR = STORAGE_DIR / "songs"
STEMS_DIR = STORAGE_DIR / "stems"
EDITS_DIR = STORAGE_DIR / "edits"
DB_DIR = STORAGE_DIR / "db"
DB_PATH = DB_DIR / "mixboard.db"

# Database: use DATABASE_URL env var (PostgreSQL) or fallback to local SQLite
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DB_PATH}")

# Ensure directories exist
for d in [SONGS_DIR, STEMS_DIR, EDITS_DIR, DB_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Audio settings
SUPPORTED_FORMATS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac", ".wma"}
YTDLP_FORMAT = "bestaudio/best"
YTDLP_AUDIO_FORMAT = "mp3"
YTDLP_AUDIO_QUALITY = "320"

# Demucs
DEMUCS_MODEL = "htdemucs"
