import json


def analyze_audio_fast(file_path: str) -> dict:
    """Fast analysis using mutagen only (duration). Used during download."""
    from mutagen import File as MutagenFile

    duration = 0.0
    try:
        mf = MutagenFile(file_path)
        if mf and mf.info:
            duration = mf.info.length
    except Exception:
        pass

    return {
        "duration_seconds": round(duration, 2),
        "bpm": None,
        "key": None,
        "waveform_peaks": None,
    }


def analyze_audio_full(file_path: str) -> dict:
    """Full analysis with librosa (BPM, key, waveform). Run in background."""
    try:
        return _analyze_with_librosa(file_path)
    except Exception:
        return analyze_audio_fast(file_path)


def _analyze_with_librosa(file_path: str) -> dict:
    import librosa
    import numpy as np

    # Get duration without loading the full audio
    duration = librosa.get_duration(path=file_path)

    # Load only the first 30s at low sample rate for BPM/key analysis
    y, sr = librosa.load(file_path, sr=11025, mono=True, duration=30)

    # BPM detection
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo) if not hasattr(tempo, '__len__') else float(tempo[0])

    # Key detection
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    key_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    key_strengths = chroma.mean(axis=1)
    detected_key = key_names[int(np.argmax(key_strengths))]

    # Free memory before loading for waveform
    del y, chroma, key_strengths

    # Waveform peaks at minimal sample rate
    y_full, _ = librosa.load(file_path, sr=4000, mono=True)
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
