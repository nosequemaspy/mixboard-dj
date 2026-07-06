import json
import logging
import subprocess

logger = logging.getLogger(__name__)


def _get_duration_ffprobe(file_path: str) -> float:
    """Get audio duration using ffprobe (works with any format including webm)."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                file_path,
            ],
            capture_output=True, text=True, timeout=15,
        )
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return 0.0


def analyze_audio_fast(file_path: str) -> dict:
    """Fast analysis: duration via ffprobe (works with webm, m4a, mp3, etc.)."""
    duration = 0.0

    # Try mutagen first (fast, handles mp3/flac/ogg well)
    try:
        from mutagen import File as MutagenFile
        mf = MutagenFile(file_path)
        if mf and mf.info:
            duration = mf.info.length
    except Exception:
        pass

    # Fallback to ffprobe for formats mutagen can't handle (webm, etc.)
    if duration <= 0:
        duration = _get_duration_ffprobe(file_path)

    return {
        "duration_seconds": round(duration, 2),
        "bpm": None,
        "key": None,
        "waveform_peaks": None,
    }
