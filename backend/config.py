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
AUDIO_QUALITY = os.environ.get("AUDIO_QUALITY", "192")  # 192kbps: ~5MB per song, 350 songs ≈ 1.7GB

# Cobalt API (external service for YouTube audio extraction)
COBALT_API_URL = os.environ.get("COBALT_API_URL", "https://api.cobalt.tools")

# Storage limits
STORAGE_LIMIT_GB = int(os.environ.get("STORAGE_LIMIT_GB", "3"))
STORAGE_LIMIT_BYTES = STORAGE_LIMIT_GB * 1024 * 1024 * 1024
MAX_UPLOAD_SIZE_MB = int(os.environ.get("MAX_UPLOAD_SIZE_MB", "50"))
MAX_DOWNLOAD_DURATION = int(os.environ.get("MAX_DOWNLOAD_DURATION", "900"))  # 15 minutes
