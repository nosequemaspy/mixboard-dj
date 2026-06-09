import type { DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';

interface VocalMuteToggleProps {
  deckId: DeckId;
}

export function VocalMuteToggle({ deckId }: VocalMuteToggleProps) {
  const deck = useDeckStore(s => deckId === 'A' ? s.deckA : s.deckB);
  const setVocalMuted = useDeckStore(s => s.setVocalMuted);
  const engine = getAudioEngine();

  const hasStemsReady = deck.song?.stems_status === 'ready';

  const handleToggle = () => {
    if (!hasStemsReady) return;
    const newValue = !deck.vocalMuted;
    engine.setVocalMute(deckId, newValue);
    setVocalMuted(deckId, newValue);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={!hasStemsReady}
      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
        deck.vocalMuted
          ? 'bg-danger text-white shadow-lg shadow-danger/30'
          : hasStemsReady
            ? 'border border-border text-text-secondary hover:text-danger hover:border-danger/50'
            : 'border border-border/50 text-text-muted opacity-40'
      }`}
      title={hasStemsReady ? 'Toggle vocal mute' : 'Separate stems first to enable vocal mute'}
    >
      {deck.vocalMuted ? 'VOCALS OFF' : 'VOCAL MUTE'}
    </button>
  );
}
