from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from config import DATABASE_URL

# SQLite needs check_same_thread; PostgreSQL needs pool config
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=10, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate(engine_):
    """Add new columns to existing tables (safe for both SQLite and PostgreSQL)."""
    from sqlalchemy import text, inspect
    try:
        insp = inspect(engine_)
        with engine_.connect() as conn:
            # Add separator_text to session_items if missing
            if "session_items" in insp.get_table_names():
                cols = [c["name"] for c in insp.get_columns("session_items")]
                if "separator_text" not in cols:
                    conn.execute(text("ALTER TABLE session_items ADD COLUMN separator_text VARCHAR(500)"))
                    conn.commit()
    except Exception:
        pass  # Column may already exist from a concurrent deploy


def init_db():
    from models import song, category, playlist, stem, edit, task, settings, session  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _migrate(engine)
