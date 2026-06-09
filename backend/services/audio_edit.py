import json
from pathlib import Path

from pydub import AudioSegment
from sqlalchemy.orm import Session

from config import EDITS_DIR, STEMS_DIR, SONGS_DIR
from models.song import Song
from models.edit import EditedSong
from models.stem import Stem


def get_absolute_path(relative_path: str) -> Path:
    p = Path(relative_path)
    if p.is_absolute():
        return p
    return SONGS_DIR.parent.parent / p


def trim_audio(db: Session, song_id: int, name: str, start_seconds: float, end_seconds: float) -> EditedSong:
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise ValueError(f"Song {song_id} not found")

    audio = AudioSegment.from_file(str(get_absolute_path(song.file_path)))
    trimmed = audio[int(start_seconds * 1000):int(end_seconds * 1000)]

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{name}.mp3"
    trimmed.export(str(output_path), format="mp3", bitrate="320k")

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(EDITS_DIR.parent.parent)),
        edit_type="trim",
        edit_metadata=json.dumps({"start_seconds": start_seconds, "end_seconds": end_seconds}),
        duration_seconds=len(trimmed) / 1000.0,
    )
    db.add(edited)
    db.commit()
    db.refresh(edited)
    return edited


def cut_sections(db: Session, song_id: int, name: str, sections: list[dict]) -> EditedSong:
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise ValueError(f"Song {song_id} not found")

    audio = AudioSegment.from_file(str(get_absolute_path(song.file_path)))

    # Sort sections by start time, then remove them from end to start
    sorted_sections = sorted(sections, key=lambda s: s["start"], reverse=True)
    result = audio
    for section in sorted_sections:
        start_ms = int(section["start"] * 1000)
        end_ms = int(section["end"] * 1000)
        result = result[:start_ms] + result[end_ms:]

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{name}.mp3"
    result.export(str(output_path), format="mp3", bitrate="320k")

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(EDITS_DIR.parent.parent)),
        edit_type="cut_section",
        edit_metadata=json.dumps({"sections": sections}),
        duration_seconds=len(result) / 1000.0,
    )
    db.add(edited)
    db.commit()
    db.refresh(edited)
    return edited


def vocal_mute_sections(db: Session, song_id: int, name: str, sections: list[dict]) -> EditedSong:
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise ValueError(f"Song {song_id} not found")
    if song.stems_status != "ready":
        raise ValueError("Stems not ready for this song")

    original = AudioSegment.from_file(str(get_absolute_path(song.file_path)))

    # Get instrumental stem
    instrumental_stem = db.query(Stem).filter(
        Stem.song_id == song_id, Stem.stem_type == "instrumental"
    ).first()
    if not instrumental_stem:
        raise ValueError("Instrumental stem not found")

    instrumental = AudioSegment.from_file(str(get_absolute_path(instrumental_stem.file_path)))

    # Build result: use original everywhere except in mute sections where we use instrumental
    result = original
    for section in sorted(sections, key=lambda s: s["start"], reverse=True):
        start_ms = int(section["start"] * 1000)
        end_ms = int(section["end"] * 1000)
        inst_section = instrumental[start_ms:end_ms]
        result = result[:start_ms] + inst_section + result[end_ms:]

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{name}.mp3"
    result.export(str(output_path), format="mp3", bitrate="320k")

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(EDITS_DIR.parent.parent)),
        edit_type="vocal_mute_section",
        edit_metadata=json.dumps({"sections": sections}),
        duration_seconds=len(result) / 1000.0,
    )
    db.add(edited)
    db.commit()
    db.refresh(edited)
    return edited
