import type { DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';

interface VocalMuteToggleProps {
  deckId: DeckId;
}

export function VocalMuteToggle({ deckId }: VocalMuteToggleProps) {
  const deck = useDeckStore(s => deckId === 'A' ? s.deckA : s.deckB);
  const setVocalMuted = useDeckStore(s => s.setVocalMuted);
  const updateSongInDeck = useDeckStore(s => s.updateSongInDeck);
  const engine = getAudioEngine();

  const stemsStatus = deck.song?.stems_status;
  const hasStemsReady = stemsStatus === 'ready';
  const isProcessing = stemsStatus === 'processing';

  const handleToggle = async () => {
    if (!deck.song) return;

    const newMuted = !deck.vocalMuted;
    // Immediately update UI
    setVocalMuted(deckId, newMuted);

    if (newMuted) {
      if (hasStemsReady) {
        // Stems ready — apply audio mute instantly
        engine.setVocalMute(deckId, true);
      } else if (!isProcessing) {
        // Trigger separation in background — websocket will hot-load when done
        updateSongInDeck(deckId, { stems_status: 'processing' });
        try {
          await api.separateStems(deck.song.id);
        } catch {
          updateSongInDeck(deckId, { stems_status: 'none' });
          setVocalMuted(deckId, false);
        }
      }
      // If processing, just wait — stems_ready handler will apply the mute
    } else {
      // Unmute — instant
      engine.setVocalMute(deckId, false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={!deck.song}
      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
        deck.vocalMuted
          ? isProcessing
            ? 'bg-danger/80 text-white animate-pulse'
            : 'bg-danger text-white shadow-lg shadow-danger/30'
          : 'border border-border text-text-secondary hover:text-danger hover:border-danger/50'
      }`}
      title={
        deck.vocalMuted
          ? isProcessing
            ? 'Separating stems... will apply automatically'
            : 'Click to unmute vocals'
          : 'Click to mute vocals'
      }
    >
      {deck.vocalMuted
        ? isProcessing ? 'VOCALS OFF...' : 'VOCALS OFF'
        : 'VOCAL MUTE'}
    </button>
  );
}
