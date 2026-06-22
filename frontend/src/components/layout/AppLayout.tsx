import { Header } from './Header';
import { DeckPanel } from '../deck/DeckPanel';
import { MixerPanel } from '../mixer/MixerPanel';
import { LibraryPanel } from '../library/LibraryPanel';
import { PlaylistPanel } from '../playlist/PlaylistPanel';
import { SessionPanel } from '../session/SessionPanel';
import { DownloadPanel } from '../download/DownloadPanel';
import { AudioEditor } from '../editor/AudioEditor';
import { SettingsPanel } from '../settings/SettingsPanel';
import { useMixerStore } from '../../store/mixerStore';

export function AppLayout() {
  const activePanel = useMixerStore(s => s.activePanel);

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      <Header />
      {/* Decks + Mixer row */}
      <div className="flex gap-0 border-b border-border flex-shrink-0" style={{ height: '340px' }}>
        <DeckPanel deckId="A" />
        <MixerPanel />
        <DeckPanel deckId="B" />
      </div>
      {/* Bottom panel */}
      <div className="flex-1 overflow-hidden">
        {activePanel === 'library' && <LibraryPanel />}
        {activePanel === 'playlist' && <PlaylistPanel />}
        {activePanel === 'sessions' && <SessionPanel />}
        {activePanel === 'download' && <DownloadPanel />}
        {activePanel === 'editor' && <AudioEditor />}
        {activePanel === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}
