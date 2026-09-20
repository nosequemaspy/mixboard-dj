import { useState } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { getPlaybackEngine } from '../../hooks/usePlaybackEngine';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { api } from '../../api/http';

const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5];

export function PlayerControls() {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const shuffleEnabled = usePlayerStore(s => s.shuffleEnabled);
  const speed = usePlayerStore(s => s.getCurrentPlaybackSpeed());
  const restrictedMode = usePlayerStore(s => s.restrictedMode);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);

  const handlePlayPause = () => {
    const store = usePlayerStore.getState();
    if (!store.currentItemId) {
      // Nothing playing — start from first unplayed song
      const filtered = store.getFilteredItems();
      const first = filtered.find(i => !store.playedSongIds.has(i.song_id)) || filtered[0];
      if (first) {
        store.playItem(first);
      }
      return;
    }
    store.setIsPlaying(!isPlaying);
  };

  const doPrev = () => {
    const store = usePlayerStore.getState();
    if (store.currentTime > 3) {
      store.setCurrentTime(0);
      getPlaybackEngine().seek(0);
      return;
    }
    store.playPrevious();
  };

  const handlePrev = () => {
    if (restrictedMode) {
      setConfirmAction({
        title: 'Anterior',
        message: 'Anterior / reiniciar cancion?',
        action: doPrev,
      });
      return;
    }
    doPrev();
  };

  const handleNext = () => {
    if (restrictedMode) {
      setConfirmAction({
        title: 'Siguiente',
        message: 'Siguiente cancion?',
        action: () => usePlayerStore.getState().playNext(),
      });
      return;
    }
    usePlayerStore.getState().playNext();
  };

  const handleShuffle = () => {
    if (restrictedMode) {
      setConfirmAction({
        title: 'Aleatorio',
        message: shuffleEnabled ? 'Desactivar aleatorio?' : 'Activar aleatorio?',
        action: () => usePlayerStore.getState().toggleShuffle(),
      });
      return;
    }
    usePlayerStore.getState().toggleShuffle();
  };

  const handleSpeedCycle = async () => {
    const store = usePlayerStore.getState();
    const currentSongId = store.currentSongId;
    if (!currentSongId) return;

    const currentItem = store.sessionItems.find(i => i.song_id === currentSongId);
    if (!currentItem) return;

    // Find next preset
    const currentIdx = SPEED_PRESETS.indexOf(speed);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % SPEED_PRESETS.length : 1; // default to 1.0 if not found
    const newSpeed = SPEED_PRESETS[nextIdx];

    // Apply immediately to playback engine
    getPlaybackEngine().setSpeed(newSpeed);

    // Save to API preserving existing settings
    const ps = currentItem.song.playback_settings;
    try {
      await api.updatePlaybackSettings(currentItem.song.id, {
        start_time: ps?.start_time ?? 0,
        end_time: ps?.end_time ?? null,
        transition_duration: ps?.transition_duration ?? 4,
        transition_type: ps?.transition_type ?? 'smooth',
        playback_speed: newSpeed,
      });
      // Sync session data to update local store
      const sessionId = store.sessionId;
      if (sessionId) {
        await useSessionStore.getState().fetchActiveSession(sessionId);
        usePlayerStore.getState().syncFromSessionStore();
      }
    } catch (err) {
      console.error('Failed to save speed:', err);
    }
  };

  return (
    <div className="flex items-center justify-center gap-6 py-3 px-4">
      {/* Shuffle */}
      <button
        onClick={handleShuffle}
        className={`p-3 rounded-full transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center ${
          shuffleEnabled
            ? 'text-accent bg-accent/15'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
        }`}
        title={shuffleEnabled ? 'Desactivar aleatorio' : 'Activar aleatorio'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 3 21 3 21 8" />
          <line x1="4" y1="20" x2="21" y2="3" />
          <polyline points="21 16 21 21 16 21" />
          <line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
        </svg>
      </button>

      {/* Previous */}
      <button
        onClick={handlePrev}
        className="p-3 rounded-full text-text-primary hover:bg-bg-tertiary transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
        title="Anterior"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      {/* Play/Pause — 64px */}
      <button
        onClick={handlePlayPause}
        className="w-16 h-16 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors shadow-lg"
        title={isPlaying ? 'Pausar' : 'Reproducir'}
      >
        {isPlaying ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Next */}
      <button
        onClick={handleNext}
        className="p-3 rounded-full text-text-primary hover:bg-bg-tertiary transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
        title="Siguiente"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
      </button>

      {/* Speed button */}
      {!restrictedMode && (
        <button
          onClick={handleSpeedCycle}
          className={`p-3 rounded-full transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center ${
            speed !== 1.0
              ? 'text-accent bg-accent/15'
              : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
          }`}
          title={`Velocidad: ${speed.toFixed(2)}x — Click para cambiar`}
        >
          <span className="text-xs font-mono font-bold">
            {speed === 1.0 ? '1x' : `${speed.toFixed(2).replace(/0$/, '')}x`}
          </span>
        </button>
      )}

      {/* Confirmation dialog for restricted mode */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        onConfirm={() => {
          confirmAction?.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
