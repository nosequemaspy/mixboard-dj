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
  const hasError = stemsStatus === 'error';

  const handleToggle = async () => {
    if (!deck.song) return;

    const newMuted = !deck.vocalMuted;
    // Immediately update UI
    setVocalMuted(deckId, newMuted);

    if (newMuted) {
      if (hasStemsReady) {
        // Stems ready — ensure instrumental buffer is loaded, then mute
        if (!engine.isInstrumentalLoaded(deckId)) {
          const loaded = await engine.loadInstrumentalHot(deckId, deck.song.id);
          if (!loaded) {
            setVocalMuted(deckId, false);
            return;
          }
        }
        engine.setVocalMute(deckId, true);
      } else {
        // Not ready — trigger (or re-trigger) separation
        updateSongInDeck(deckId, { stems_status: 'processing' });
        try {
          await api.separateStems(deck.song.id);
        } catch {
          updateSongInDeck(deckId, { stems_status: 'error' });
          setVocalMuted(deckId, false);
        }
      }
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
            : hasError
              ? 'bg-danger/60 text-white'
              : 'bg-danger text-white shadow-lg shadow-danger/30'
          : hasError
            ? 'border border-danger/50 text-danger'
            : 'border border-border text-text-secondary hover:text-danger hover:border-danger/50'
      }`}
      title={
        hasError
          ? 'Stem separation failed — click to retry'
          : deck.vocalMuted
            ? isProcessing
              ? 'Separating stems... will apply automatically'
              : 'Click to unmute vocals'
            : 'Click to mute vocals'
      }
    >
      {deck.vocalMuted
        ? isProcessing ? 'VOCALS OFF...' : hasError ? 'ERROR' : 'VOCALS OFF'
        : hasError ? 'RETRY' : 'VOCAL MUTE'}
    </button>
  );
}
