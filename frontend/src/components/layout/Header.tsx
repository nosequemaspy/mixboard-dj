import { useState, useEffect } from 'react';
import { useMixerStore } from '../../store/mixerStore';
import { api } from '../../api/http';

const tabs = [
  { id: 'library' as const, label: 'Library' },
  { id: 'sessions' as const, label: 'Sessions' },
  { id: 'download' as const, label: 'Download' },
  { id: 'editor' as const, label: 'Editor' },
];

function formatBytesShort(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function Header() {
  const { activePanel, setActivePanel } = useMixerStore();
  const [storage, setStorage] = useState<{ total_bytes: number; limit_bytes: number; usage_percent: number } | null>(null);

  // Fetch storage once on mount, then every 5 minutes
  useEffect(() => {
    const load = () => api.getStorageUsage().then(setStorage).catch(() => {});
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const isDanger = storage && storage.usage_percent >= 90;
  const isWarning = storage && storage.usage_percent >= 70;

  return (
    <header className="flex items-center justify-between px-2 md:px-4 py-2 bg-bg-secondary border-b border-border">
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        <h1 className="text-base md:text-lg font-bold text-accent tracking-tight">MixBoard</h1>
        <span className="text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded hidden sm:inline">DJ</span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto">
        <nav className="flex gap-0.5 md:gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActivePanel(tab.id)}
              className={`px-2 md:px-3 py-1.5 text-xs md:text-sm rounded-md transition-colors whitespace-nowrap flex-shrink-0 ${
                activePanel === tab.id
                  ? 'bg-accent text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="w-px h-5 bg-border mx-1 md:mx-2 flex-shrink-0" />

        {/* Storage indicator */}
        {storage && (
          <button
            onClick={() => setActivePanel('settings')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono transition-colors mr-1 flex-shrink-0 ${
              isDanger ? 'bg-danger/15 text-danger hover:bg-danger/25' :
              isWarning ? 'bg-warning/15 text-warning hover:bg-warning/25' :
              'bg-bg-tertiary text-text-muted hover:bg-bg-hover hover:text-text-secondary'
            }`}
            title="Almacenamiento — click para ver detalles"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <div className="w-14 bg-bg-primary rounded-full h-1.5 overflow-hidden hidden sm:block">
              <div
                className={`h-full rounded-full ${isDanger ? 'bg-danger' : isWarning ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: `${Math.min(storage.usage_percent, 100)}%` }}
              />
            </div>
            <span className="hidden sm:inline">{formatBytesShort(storage.total_bytes)}</span>
          </button>
        )}

        <button
          onClick={() => setActivePanel('settings')}
          className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${
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
