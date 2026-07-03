import json
import re
import subprocess
from pathlib import Path

from sqlalchemy.orm import Session

from config import EDITS_DIR, STEMS_DIR, SONGS_DIR, STORAGE_DIR
from models.song import Song
from models.edit import EditedSong
from models.stem import Stem


def sanitize_filename(name: str) -> str:
    """Remove characters that are invalid in filenames."""
    safe = re.sub(r'[<>:"/\\|?*]', '', name).strip()
    safe = safe[:200] if len(safe) > 200 else safe
    return safe or "edit"


def get_absolute_path(relative_path: str) -> Path:
    p = Path(relative_path)
    if p.is_absolute():
        return p
    resolved = (STORAGE_DIR.parent / p).resolve()
    # Ensure the path stays within the project directory
    if not str(resolved).startswith(str(STORAGE_DIR.parent.resolve())):
        raise ValueError("Invalid file path")
    return resolved


def get_duration_ffprobe(file_path: Path) -> float:
    """Get audio duration in seconds using ffprobe (no memory usage)."""
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(file_path)],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise ValueError(f"ffprobe failed: {result.stderr}")
    import json as _json
    info = _json.loads(result.stdout)
    return float(info["format"]["duration"])


def run_ffmpeg(cmd: list[str]):
    """Run an ffmpeg command and raise on failure."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise ValueError(f"ffmpeg failed: {result.stderr[:500]}")


def trim_audio(db: Session, song_id: int, name: str, start_seconds: float, end_seconds: float) -> EditedSong:
    song = db.query(Song).filter(Song.id == song_id).first()
    if not song:
        raise ValueError(f"Song {song_id} not found")

    if start_seconds < 0 or end_seconds <= start_seconds:
        raise ValueError("Invalid trim range: start must be >= 0 and end must be > start")

    input_path = get_absolute_path(song.file_path)
    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(name)
    output_path = output_dir / f"{safe_name}.mp3"

    run_ffmpeg([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-ss", str(start_seconds),
        "-to", str(end_seconds),
        "-c:a", "libmp3lame", "-b:a", "320k",
        str(output_path),
    ])

    duration = get_duration_ffprobe(output_path)

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(STORAGE_DIR.parent)),
        edit_type="trim",
        edit_metadata=json.dumps({"start_seconds": start_seconds, "end_seconds": end_seconds}),
        duration_seconds=duration,
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

    input_path = get_absolute_path(song.file_path)
    total_duration = song.duration_seconds or get_duration_ffprobe(input_path)

    # Calculate keep sections (complement of cut sections)
    sorted_sections = sorted(sections, key=lambda s: s["start"])
    keep = []
    cursor = 0.0
    for s in sorted_sections:
        if s["start"] > cursor:
            keep.append((cursor, s["start"]))
        cursor = max(cursor, s["end"])
    if cursor < total_duration:
        keep.append((cursor, total_duration))

    if not keep:
        raise ValueError("Cut sections produce empty audio")

    # Build ffmpeg filter: atrim each keep segment, then concat
    filter_parts = []
    for i, (start, end) in enumerate(keep):
        filter_parts.append(f"[0:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[a{i}]")
    concat_inputs = "".join(f"[a{i}]" for i in range(len(keep)))
    filter_parts.append(f"{concat_inputs}concat=n={len(keep)}:v=0:a=1[out]")
    filter_complex = ";".join(filter_parts)

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(name)
    output_path = output_dir / f"{safe_name}.mp3"

    run_ffmpeg([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-c:a", "libmp3lame", "-b:a", "320k",
        str(output_path),
    ])

    duration = get_duration_ffprobe(output_path)

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(STORAGE_DIR.parent)),
        edit_type="cut_section",
        edit_metadata=json.dumps({"sections": sections}),
        duration_seconds=duration,
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

    input_path = get_absolute_path(song.file_path)
    total_duration = song.duration_seconds or get_duration_ffprobe(input_path)

    instrumental_stem = db.query(Stem).filter(
        Stem.song_id == song_id, Stem.stem_type == "instrumental"
    ).first()
    if not instrumental_stem:
        raise ValueError("Instrumental stem not found")
    instrumental_path = get_absolute_path(instrumental_stem.file_path)

    # Build segments: original for non-muted parts, instrumental for muted parts
    # input 0 = original, input 1 = instrumental
    sorted_sections = sorted(sections, key=lambda s: s["start"])
    segments = []
    cursor = 0.0
    for s in sorted_sections:
        start = max(cursor, s["start"])
        end = s["end"]
        if start > cursor:
            # Keep original from cursor to start
            segments.append((0, cursor, start))
        if end > start:
            # Use instrumental for muted section
            segments.append((1, start, end))
        cursor = max(cursor, end)
    if cursor < total_duration:
        segments.append((0, cursor, total_duration))

    if not segments:
        raise ValueError("Mute sections produce empty audio")

    # Build ffmpeg filter_complex
    filter_parts = []
    for i, (input_idx, start, end) in enumerate(segments):
        filter_parts.append(f"[{input_idx}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS[s{i}]")
    concat_inputs = "".join(f"[s{i}]" for i in range(len(segments)))
    filter_parts.append(f"{concat_inputs}concat=n={len(segments)}:v=0:a=1[out]")
    filter_complex = ";".join(filter_parts)

    output_dir = EDITS_DIR / str(song_id)
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(name)
    output_path = output_dir / f"{safe_name}.mp3"

    run_ffmpeg([
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-i", str(instrumental_path),
        "-filter_complex", filter_complex,
        "-map", "[out]",
        "-c:a", "libmp3lame", "-b:a", "320k",
        str(output_path),
    ])

    duration = get_duration_ffprobe(output_path)

    edited = EditedSong(
        original_song_id=song_id,
        name=name,
        file_path=str(output_path.relative_to(STORAGE_DIR.parent)),
        edit_type="vocal_mute_section",
        edit_metadata=json.dumps({"sections": sections}),
        duration_seconds=duration,
    )
    db.add(edited)
    db.commit()
    db.refresh(edited)
    return edited
