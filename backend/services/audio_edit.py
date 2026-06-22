import json
from pathlib import Path

from pydub import AudioSegment
from sqlalchemy.orm import Session

from config import EDITS_DIR, STEMS_DIR, SONGS_DIR, STORAGE_DIR
from models.song import Song
from models.edit import EditedSong
from models.stem import Stem


def get_absolute_path(relative_path: str) -> Path:
    p = Path(relative_path)
    if p.is_absolute():
        return p
    resolved = (STORAGE_DIR.parent / p).resolve()
    # Ensure the path stays within the project directory
    if not str(resolved).startswith(str(STORAGE_DIR.parent.resolve())):
        raise ValueError("Invalid file path")
    return resolved


def trim_audio(db: Session, song_id: int, name: str, start_seconds: float, end_seconds: float) -> EditedSong:
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise ValueError(f"Song {song_id} not found")

    if start_seconds < 0 or end_seconds <= start_seconds:
        raise ValueError("Invalid trim range: start must be >= 0 and end must be > start")

    audio = AudioSegment.from_file(str(get_absolute_path(song.file_path)))
    trimmed = audio[int(start_seconds * 1000):int(end_seconds * 1000)]

    if len(trimmed) == 0:
        raise ValueError("Trim range produces empty audio")

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{name}.mp3"
    trimmed.export(str(output_path), format="mp3", bitrate="320k")

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(STORAGE_DIR.parent)),
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

    for section in sections:
        if section.get("start", 0) < 0 or section.get("end", 0) <= section.get("start", 0):
            raise ValueError("Invalid section: start must be >= 0 and end must be > start")

    audio = AudioSegment.from_file(str(get_absolute_path(song.file_path)))

    # Sort sections by start time, then remove them from end to start
    sorted_sections = sorted(sections, key=lambda s: s["start"], reverse=True)
    result = audio
    for section in sorted_sections:
        start_ms = int(section["start"] * 1000)
        end_ms = int(section["end"] * 1000)
        result = result[:start_ms] + result[end_ms:]

    if len(result) == 0:
        raise ValueError("Cut sections produce empty audio")

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{name}.mp3"
    result.export(str(output_path), format="mp3", bitrate="320k")

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(STORAGE_DIR.parent)),
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

    for section in sections:
        if section.get("start", 0) < 0 or section.get("end", 0) <= section.get("start", 0):
            raise ValueError("Invalid section: start must be >= 0 and end must be > start")

    original = AudioSegment.from_file(str(get_absolute_path(song.file_path)))

    # Get instrumental stem
    instrumental_stem = db.query(Stem).filter(
        Stem.song_id == song_id, Stem.stem_type == "instrumental"
    ).first()
    if not instrumental_stem:
        raise ValueError("Instrumental stem not found")

    instrumental = AudioSegment.from_file(str(get_absolute_path(instrumental_stem.file_path)))

    # Match instrumental length to original to avoid index mismatches
    orig_len = len(original)
    inst_len = len(instrumental)
    if inst_len < orig_len:
        # Pad instrumental with silence to match original length
        instrumental = instrumental + AudioSegment.silent(duration=orig_len - inst_len)
    elif inst_len > orig_len:
        instrumental = instrumental[:orig_len]

    # Build result: use original everywhere except in mute sections where we use instrumental
    # Process forward to avoid index shifting issues
    result = AudioSegment.empty()
    sorted_sections = sorted(sections, key=lambda s: s["start"])
    cursor = 0
    for section in sorted_sections:
        start_ms = int(section["start"] * 1000)
        end_ms = int(section["end"] * 1000)
        # Clamp to audio bounds
        start_ms = max(cursor, min(start_ms, orig_len))
        end_ms = max(start_ms, min(end_ms, orig_len))
        # Add original audio up to this section
        if start_ms > cursor:
            result += original[cursor:start_ms]
        # Add instrumental for this section
        if end_ms > start_ms:
            result += instrumental[start_ms:end_ms]
        cursor = end_ms
    # Add remaining original audio
    if cursor < orig_len:
        result += original[cursor:]

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{name}.mp3"
    result.export(str(output_path), format="mp3", bitrate="320k")

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(STORAGE_DIR.parent)),
        edit_type="vocal_mute_section",
        edit_metadata=json.dumps({"sections": sections}),
        duration_seconds=len(result) / 1000.0,
    )
    db.add(edited)
    db.commit()
    db.refresh(edited)
    return edited
