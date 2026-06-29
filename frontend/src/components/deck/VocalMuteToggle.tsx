import { useState } from 'react';
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
  const [separating, setSeparating] = useState(false);

  const stemsStatus = deck.song?.stems_status;
  const hasStemsReady = stemsStatus === 'ready';
  const isProcessing = stemsStatus === 'processing' || separating;

  const handleToggle = async () => {
    if (!deck.song) return;

    if (hasStemsReady) {
      // Normal toggle
      const newValue = !deck.vocalMuted;
      engine.setVocalMute(deckId, newValue);
      setVocalMuted(deckId, newValue);
      return;
    }

    if (isProcessing) return;

    // Auto-trigger stem separation
    try {
      setSeparating(true);
      updateSongInDeck(deckId, { stems_status: 'processing' });
      await api.separateStems(deck.song.id);
      // stems_ready websocket event will update the song status
    } catch {
      setSeparating(false);
      updateSongInDeck(deckId, { stems_status: 'none' });
    }
  };

  const label = deck.vocalMuted
    ? 'VOCALS OFF'
    : isProcessing
      ? 'SEPARATING...'
      : 'VOCAL MUTE';

  return (
    <button
      onClick={handleToggle}
      disabled={isProcessing}
      className={`px-3 py-1 rounded text-xs font-bold transition-all ${
        deck.vocalMuted
          ? 'bg-danger text-white shadow-lg shadow-danger/30'
          : isProcessing
            ? 'border border-warning/50 text-warning animate-pulse'
            : hasStemsReady
              ? 'border border-border text-text-secondary hover:text-danger hover:border-danger/50'
              : 'border border-border/50 text-text-muted hover:text-warning hover:border-warning/50'
      }`}
      title={
        hasStemsReady
          ? 'Toggle vocal mute'
          : isProcessing
            ? 'Separating stems...'
            : 'Click to separate stems and enable vocal mute'
      }
    >
      {label}
    </button>
  );
}
