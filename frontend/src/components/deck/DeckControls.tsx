import type { DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface DeckControlsProps {
  deckId: DeckId;
}

export function DeckControls({ deckId }: DeckControlsProps) {
  const deck = useDeckStore(s => deckId === 'A' ? s.deckA : s.deckB);
  const setPlaying = useDeckStore(s => s.setPlaying);
  const setCuePoint = useDeckStore(s => s.setCuePoint);
  const setCurrentTime = useDeckStore(s => s.setCurrentTime);

  const engine = getAudioEngine();
  const color = deckId === 'A' ? 'text-deck-a' : 'text-deck-b';
  const bgColor = deckId === 'A' ? 'bg-deck-a' : 'bg-deck-b';

  const handlePlayPause = () => {
    if (!deck.song) return;
    if (deck.isPlaying) {
      engine.pause(deckId);
      setPlaying(deckId, false);
    } else {
      engine.play(deckId);
      setPlaying(deckId, true);
    }
  };

  const handleCue = () => {
    if (!deck.song) return;
    engine.seek(deckId, deck.cuePoint);
    setCurrentTime(deckId, deck.cuePoint);
  };

  const handleSetCue = () => {
    setCuePoint(deckId, deck.currentTime);
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        disabled={!deck.song}
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all disabled:opacity-30
          ${deck.isPlaying ? `${bgColor} text-white` : `border border-border hover:${bgColor}/20 ${color}`}`}
      >
        {deck.isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="4" height="12" rx="1" />
            <rect x="9" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M2 1l10 6-10 6V1z" />
          </svg>
        )}
      </button>

      {/* CUE */}
      <button
        onClick={handleCue}
        disabled={!deck.song}
        className="px-3 h-10 rounded-lg border border-border text-warning hover:bg-warning/10 text-xs font-bold disabled:opacity-30 transition-colors"
      >
        CUE
      </button>

      {/* Set Cue */}
      <button
        onClick={handleSetCue}
        disabled={!deck.song}
        className="px-2 h-10 rounded-lg border border-border text-text-muted hover:text-warning text-[10px] disabled:opacity-30 transition-colors"
        title="Set cue point"
      >
        SET
      </button>

      {/* Time display */}
      <div className="ml-auto flex gap-3 text-xs font-mono">
        <span className={color}>{formatTime(deck.currentTime)}</span>
        <span className="text-text-muted">/</span>
        <span className="text-text-muted">{formatTime(deck.duration)}</span>
      </div>
    </div>
  );
}
