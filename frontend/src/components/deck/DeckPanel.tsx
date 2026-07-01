import { useCallback } from 'react';
import type { DeckId, MuteSection, Song } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';
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
  const setMuteSections = useDeckStore(s => s.setMuteSections);
  const setMuteSectionsActive = useDeckStore(s => s.setMuteSectionsActive);
  const updateSongInDeck = useDeckStore(s => s.updateSongInDeck);
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

      // Fetch saved edits and apply vocal mute sections
      try {
        const edits = await api.getEdits(song.id);
        const muteEdits = edits.filter((e: any) => e.edit_type === 'vocal_mute_section');
        const allSections: MuteSection[] = [];
        for (const edit of muteEdits) {
          try {
            const meta = typeof edit.edit_metadata === 'string'
              ? JSON.parse(edit.edit_metadata)
              : edit.edit_metadata;
            if (meta?.sections) {
              allSections.push(...meta.sections);
            }
          } catch { /* skip malformed metadata */ }
        }
        if (allSections.length > 0) {
          setMuteSections(deckId, allSections);
          engine.setMuteSections(deckId, allSections);

          // Auto-load instrumental if stems ready but not loaded yet
          if (song.stems_status === 'ready' && !engine.isInstrumentalLoaded(deckId)) {
            engine.loadInstrumentalHot(deckId, song.id);
          } else if (song.stems_status !== 'ready' && song.stems_status !== 'processing') {
            // Trigger stem separation so mute sections work
            updateSongInDeck(deckId, { stems_status: 'processing' });
            api.separateStems(song.id).catch(() => {
              updateSongInDeck(deckId, { stems_status: 'error' });
            });
          }
        }
      } catch {
        // Edits fetch failed, non-critical
      }
    } catch (err) {
      console.error('Failed to load song:', err);
    }
  }, [deckId, loadSong, setDuration, setMuteSections, updateSongInDeck, engine]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleSeek = (time: number) => {
    engine.seek(deckId, time);
    setCurrentTime(deckId, time);
  };

  const handleToggleMuteSections = () => {
    const newActive = !deck.muteSectionsActive;
    setMuteSectionsActive(deckId, newActive);
    engine.setMuteSectionsActive(deckId, newActive);
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
        <div className="flex items-center gap-1.5">
          {deck.muteSections.length > 0 && (
            <button
              onClick={handleToggleMuteSections}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                deck.muteSectionsActive
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/30'
                  : 'border border-amber-500/40 text-amber-500/60'
              }`}
              title={deck.muteSectionsActive ? 'Click to disable mute edit sections' : 'Click to enable mute edit sections'}
            >
              {deck.muteSectionsActive ? 'MUTE EDIT' : 'MUTE EDIT OFF'}
            </button>
          )}
          <VocalMuteToggle deckId={deckId} />
        </div>
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
        muteSections={deck.muteSections}
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
