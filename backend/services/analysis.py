import json


def analyze_audio(file_path: str) -> dict:
    """Analyze audio file for BPM, key, duration, and waveform peaks.

    Falls back to basic mutagen analysis if librosa is not installed.
    """
    try:
        return _analyze_with_librosa(file_path)
    except ImportError:
        return _analyze_basic(file_path)


def _analyze_with_librosa(file_path: str) -> dict:
    import librosa
    import numpy as np

    # Get duration without loading the full audio
    duration = librosa.get_duration(path=file_path)

    # Load only the first 60s at low sample rate for BPM/key analysis
    y, sr = librosa.load(file_path, sr=22050, mono=True, duration=60)

    # BPM detection
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo) if not hasattr(tempo, '__len__') else float(tempo[0])

    # Key detection
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    key_strengths = chroma.mean(axis=1)
    detected_key = key_names[int(np.argmax(key_strengths))]

    # Waveform peaks: reload full audio at very low sr for speed
    y_full, _ = librosa.load(file_path, sr=8000, mono=True)
    num_peaks = 800
    chunk_size = max(1, len(y_full) // num_peaks)
    peaks = []
    for i in range(0, len(y_full), chunk_size):
        chunk = y_full[i:i + chunk_size]
        if len(chunk) > 0:
            peaks.append(float(np.max(np.abs(chunk))))
    max_peak = max(peaks) if peaks else 1.0
    if max_peak > 0:
        peaks = [p / max_peak for p in peaks]

    return {
        "duration_seconds": round(duration, 2),
        "bpm": round(bpm, 1),
        "key": detected_key,
        "waveform_peaks": json.dumps(peaks),
    }


def _analyze_basic(file_path: str) -> dict:
    """Fallback analysis using mutagen (no BPM/key, just duration + simple peaks)."""
    from mutagen import File as MutagenFile
    import struct
    import wave
    from pathlib import Path

    duration = 0.0
    try:
        mf = MutagenFile(file_path)
        if mf and mf.info:
            duration = mf.info.length
    except Exception:
        pass

    # Simple waveform: generate fake peaks based on file or return empty
    peaks = []
    ext = Path(file_path).suffix.lower()
    if ext == ".wav":
        try:
            with wave.open(file_path, 'rb') as wf:
                n_frames = wf.getnframes()
                sample_width = wf.getsampwidth()
                n_channels = wf.getnchannels()
                num_peaks = 800
                frames_per_peak = max(1, n_frames // num_peaks)
                for _ in range(min(num_peaks, n_frames)):
                    raw = wf.readframes(frames_per_peak)
                    if not raw:
                        break
                    if sample_width == 2:
                        samples = struct.unpack(f"<{len(raw)//2}h", raw)
                        peak = max(abs(s) for s in samples) / 32768.0 if samples else 0
                    else:
                        peak = max(raw) / 255.0 if raw else 0
                    peaks.append(peak)
            max_peak = max(peaks) if peaks else 1.0
            if max_peak > 0:
                peaks = [p / max_peak for p in peaks]
        except Exception:
            peaks = []

    return {
        "duration_seconds": round(duration, 2),
        "bpm": None,
        "key": None,
        "waveform_peaks": json.dumps(peaks) if peaks else None,
    }
