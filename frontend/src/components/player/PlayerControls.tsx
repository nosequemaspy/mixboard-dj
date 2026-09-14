import { usePlayerStore } from '../../store/playerStore';
import { getPlaybackEngine } from '../../hooks/usePlaybackEngine';

export function PlayerControls() {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const shuffleEnabled = usePlayerStore(s => s.shuffleEnabled);
  const speed = usePlayerStore(s => s.getCurrentPlaybackSpeed());

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

  const handlePrev = () => {
    const store = usePlayerStore.getState();
    if (store.currentTime > 3) {
      // Restart current song
      store.setCurrentTime(0);
      getPlaybackEngine().seek(0);
      return;
    }
    store.playPrevious();
  };

  const handleNext = () => {
    usePlayerStore.getState().playNext();
  };

  const handleShuffle = () => {
    usePlayerStore.getState().toggleShuffle();
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

      {/* Speed indicator */}
      <div className="min-w-[48px] min-h-[48px] flex items-center justify-center">
        {speed !== 1.0 && (
          <span className="text-xs font-mono text-accent bg-accent/10 px-2 py-1 rounded">
            {speed.toFixed(1)}x
          </span>
        )}
      </div>
    </div>
  );
}
