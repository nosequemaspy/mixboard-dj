import { useState } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { getPlaybackEngine } from '../../hooks/usePlaybackEngine';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { api } from '../../api/http';

const SPEED_PRESETS = [0.75, 1.0, 1.25, 1.5];

export function PlayerControls() {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const isLoadingSong = usePlayerStore(s => s.isLoadingSong);
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
    const currentItemId = store.currentItemId;
    if (!currentItemId) return;

    const currentItem = store.sessionItems.find(i => i.id === currentItemId);
    if (!currentItem) return;

    // Find next preset
    const currentIdx = SPEED_PRESETS.indexOf(speed);
    const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % SPEED_PRESETS.length : 1;
    const newSpeed = SPEED_PRESETS[nextIdx];

    // Apply immediately to playback engine
    getPlaybackEngine().setSpeed(newSpeed);

    // Save per session item
    const sessionId = store.sessionId;
    if (!sessionId) return;
    const password = useSessionStore.getState().getPassword(sessionId);
    try {
      await api.updateSessionItem(sessionId, currentItem.id, {
        playback_speed: newSpeed,
      }, password);
      await useSessionStore.getState().fetchActiveSession(sessionId);
      usePlayerStore.getState().syncFromSessionStore();
    } catch (err) {
      console.error('Failed to save speed:', err);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-6 py-2 sm:py-3 px-2 sm:px-4 overflow-hidden">
      {/* Shuffle */}
      <button
        onClick={handleShuffle}
        className={`p-2 sm:p-3 rounded-full transition-colors min-w-[40px] min-h-[40px] sm:min-w-[48px] sm:min-h-[48px] flex items-center justify-center ${
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
        disabled={isLoadingSong && isPlaying}
        className={`p-2 sm:p-3 rounded-full transition-colors min-w-[40px] min-h-[40px] sm:min-w-[48px] sm:min-h-[48px] flex items-center justify-center ${
          isLoadingSong && isPlaying
            ? 'text-text-muted opacity-50 cursor-not-allowed'
            : 'text-text-primary hover:bg-bg-tertiary'
        }`}
        title="Anterior"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
      </button>

      {/* Play/Pause — 64px */}
      <button
        onClick={handlePlayPause}
        className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors shadow-lg flex-shrink-0"
        title={isLoadingSong && isPlaying ? 'Cargando...' : isPlaying ? 'Pausar' : 'Reproducir'}
      >
        {isLoadingSong && isPlaying ? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : isPlaying ? (
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
        disabled={isLoadingSong && isPlaying}
        className={`p-2 sm:p-3 rounded-full transition-colors min-w-[40px] min-h-[40px] sm:min-w-[48px] sm:min-h-[48px] flex items-center justify-center ${
          isLoadingSong && isPlaying
            ? 'text-text-muted opacity-50 cursor-not-allowed'
            : 'text-text-primary hover:bg-bg-tertiary'
        }`}
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
          className={`p-2 sm:p-3 rounded-full transition-colors min-w-[40px] min-h-[40px] sm:min-w-[48px] sm:min-h-[48px] flex items-center justify-center ${
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
