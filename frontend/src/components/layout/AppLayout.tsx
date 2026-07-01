import { useEffect } from 'react';
import { Header } from './Header';
import { DeckPanel } from '../deck/DeckPanel';
import { MixerPanel } from '../mixer/MixerPanel';
import { LibraryPanel } from '../library/LibraryPanel';
import { SessionPanel } from '../session/SessionPanel';
import { DownloadPanel } from '../download/DownloadPanel';
import { AudioEditor } from '../editor/AudioEditor';
import { SettingsPanel } from '../settings/SettingsPanel';
import { useMixerStore } from '../../store/mixerStore';
import { useLibraryStore } from '../../store/libraryStore';
import { Crossfader } from '../mixer/Crossfader';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';

function MobileCrossfader() {
  const store = useDeckStore();
  const engine = getAudioEngine();

  const handleCrossfader = (v: number) => {
    engine.setCrossfader(v);
    store.setCrossfader(v);
  };

  return (
    <div className="lg:hidden px-4 py-2 bg-bg-secondary border-b border-border">
      <div className="flex justify-between text-[9px] text-text-muted mb-1">
        <span className="text-deck-a">A</span>
        <span>CROSSFADER</span>
        <span className="text-deck-b">B</span>
      </div>
      <Crossfader value={store.crossfader} onChange={handleCrossfader} />
    </div>
  );
}

export function AppLayout() {
  const activePanel = useMixerStore(s => s.activePanel);

  // Load songs globally so they're available in Sessions, Editor, etc.
  useEffect(() => {
    useLibraryStore.getState().fetchSongs();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <Header />
      {/* Decks + Mixer row */}
      <div className="flex flex-col lg:flex-row gap-0 border-b border-border flex-shrink-0 lg:h-[340px]">
        <DeckPanel deckId="A" />
        <MobileCrossfader />
        <MixerPanel />
        <DeckPanel deckId="B" />
      </div>
      {/* Bottom panel */}
      <div className="flex-1 overflow-hidden min-h-[300px]">
        {activePanel === 'library' && <LibraryPanel />}
        {activePanel === 'sessions' && <SessionPanel />}
        {activePanel === 'download' && <DownloadPanel />}
        {activePanel === 'editor' && <AudioEditor />}
        {activePanel === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}
