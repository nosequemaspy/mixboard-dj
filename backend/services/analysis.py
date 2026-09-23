import json
import logging
import struct
import subprocess
import tempfile
import os

logger = logging.getLogger(__name__)

NUM_PEAKS = 800


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


def _generate_peaks_ffmpeg(file_path: str, num_peaks: int = NUM_PEAKS) -> str | None:
    """Generate waveform peaks using ffmpeg raw PCM output.

    Streams audio as low-rate mono 16-bit PCM into a temp file, then reads
    it in chunks to compute peaks. Uses ~50KB of memory regardless of track
    duration (8000 Hz * 2 bytes * chunk = tiny).
    """
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".raw")
    try:
        os.close(tmp_fd)
        # Downsample to 8kHz mono 16-bit PCM — very fast, low memory
        result = subprocess.run(
            [
                "ffmpeg", "-v", "quiet", "-y",
                "-i", file_path,
                "-ac", "1",           # mono
                "-ar", "8000",        # 8kHz sample rate
                "-f", "s16le",        # raw 16-bit signed little-endian
                "-acodec", "pcm_s16le",
                tmp_path,
            ],
            capture_output=True, timeout=120,
        )
        if result.returncode != 0:
            return None

        file_size = os.path.getsize(tmp_path)
        if file_size < 4:
            return None

        total_samples = file_size // 2  # 2 bytes per sample (s16le)
        chunk_size = max(1, total_samples // num_peaks)
        peaks: list[float] = []

        with open(tmp_path, "rb") as f:
            for _ in range(num_peaks):
                raw = f.read(chunk_size * 2)
                if not raw:
                    break
                # Unpack 16-bit signed samples
                n_samples = len(raw) // 2
                if n_samples == 0:
                    break
                samples = struct.unpack(f"<{n_samples}h", raw)
                max_val = max(abs(s) for s in samples)
                peaks.append(round(max_val / 32768.0, 4))

        if not peaks:
            return None

        # Normalize to 0.0 - 1.0
        peak_max = max(peaks) if peaks else 1.0
        if peak_max > 0:
            peaks = [round(p / peak_max, 4) for p in peaks]

        return json.dumps(peaks)
    except Exception as e:
        logger.warning(f"Peak generation failed for {file_path}: {e}")
        return None
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


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

    # Generate waveform peaks via ffmpeg (lightweight, no librosa)
    peaks_json = _generate_peaks_ffmpeg(file_path)

    return {
        "duration_seconds": round(duration, 2),
        "bpm": None,
        "key": None,
        "waveform_peaks": peaks_json,
    }
