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
