import { useCallback } from 'react';
import type { DeckId, Song } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { Waveform } from './Waveform';
import { DeckControls } from './DeckControls';
import { TempoSlider } from './TempoSlider';
import { VocalMuteToggle } from './VocalMuteToggle';

interface DeckPanelProps {
  deckId: DeckId;
}

export function DeckPanel({ deckId }: DeckPanelProps) {
  const deck = useDeckStore(s => deckId === 'A' ? s.deckA : s.deckB);
  const loadSong = useDeckStore(s => s.loadSong);
  const setDuration = useDeckStore(s => s.setDuration);
  const setCurrentTime = useDeckStore(s => s.setCurrentTime);
  const engine = getAudioEngine();
  const borderColor = deckId === 'A' ? 'border-deck-a/30' : 'border-deck-b/30';
  const label = deckId === 'A' ? 'DECK A' : 'DECK B';
  const labelColor = deckId === 'A' ? 'text-deck-a' : 'text-deck-b';

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const songData = e.dataTransfer.getData('application/json');
    if (!songData) return;
    try {
      const song: Song = JSON.parse(songData);
      loadSong(deckId, song);
      const duration = await engine.loadSong(deckId, song.id, song.stems_status === 'ready');
      setDuration(deckId, duration);
    } catch (err) {
      console.error('Failed to load song:', err);
    }
  }, [deckId, loadSong, setDuration, engine]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleSeek = (time: number) => {
    engine.seek(deckId, time);
    setCurrentTime(deckId, time);
  };

  return (
    <div
      className={`flex-1 p-3 bg-bg-secondary border-b-2 ${borderColor} flex flex-col`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-bold ${labelColor} tracking-wider`}>{label}</span>
        <VocalMuteToggle deckId={deckId} />
      </div>

      {/* Song info */}
      <div className="mb-2 min-h-[32px]">
        {deck.song ? (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{deck.song.title}</span>
            <span className="text-xs text-text-muted truncate">{deck.song.artist}</span>
            {deck.song.bpm && (
              <span className="text-[10px] bg-bg-tertiary px-1.5 py-0.5 rounded text-text-secondary ml-auto flex-shrink-0">
                {deck.song.bpm} BPM
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-text-muted italic">Drag a song here</span>
        )}
      </div>

      {/* Waveform */}
      <Waveform
        deckId={deckId}
        song={deck.song}
        currentTime={deck.currentTime}
        duration={deck.duration}
        onSeek={handleSeek}
      />

      {/* Controls */}
      <DeckControls deckId={deckId} />

      {/* Tempo */}
      <div className="mt-2">
        <TempoSlider deckId={deckId} />
      </div>
    </div>
  );
}
