import { useMixerStore } from '../../store/mixerStore';

const tabs = [
  { id: 'library' as const, label: 'Library' },
  { id: 'playlist' as const, label: 'Playlists' },
  { id: 'sessions' as const, label: 'Sessions' },
  { id: 'download' as const, label: 'Download' },
  { id: 'editor' as const, label: 'Editor' },
];

export function Header() {
  const { activePanel, setActivePanel } = useMixerStore();

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-accent tracking-tight">MixBoard</h1>
        <span className="text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">DJ</span>
      </div>
      <div className="flex items-center gap-1">
        <nav className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activePanel === tab.id
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="w-px h-5 bg-border mx-2" />
        <button
          onClick={() => setActivePanel('settings')}
          className={`p-1.5 rounded-md transition-colors ${
            activePanel === 'settings'
              ? 'bg-accent text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
          }`}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </header>
  );
}
