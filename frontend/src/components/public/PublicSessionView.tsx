import { useState, useMemo } from 'react';
import type { SessionData } from '../../types';
import { SuggestionForm } from './SuggestionForm';
import { NotesSection } from './NotesSection';
import { FolderChips } from '../session/FolderChips';

interface PublicSessionViewProps {
  session: SessionData;
  onRefresh: () => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

type Tab = 'songs' | 'notes' | 'suggest';

export function PublicSessionView({ session, onRefresh }: PublicSessionViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [search, setSearch] = useState('');
  const [activeFolder, setActiveFolder] = useState<number | null>(null);

  const folders = session.folders || [];

  const folderItemCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of session.items) {
      if (item.folder_id) {
        counts[item.folder_id] = (counts[item.folder_id] || 0) + 1;
      }
    }
    return counts;
  }, [session.items]);

  const visibleItems = useMemo(() => {
    let list = session.items;
    if (activeFolder !== null) {
      list = list.filter(i => i.folder_id === activeFolder);
      list = [...list].sort((a, b) => (a.folder_position ?? 0) - (b.folder_position ?? 0));
    } else {
      list = [...list].sort((a, b) => a.position - b.position);
    }
    return list;
  }, [session.items, activeFolder]);

  const filtered = visibleItems.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.song.title.toLowerCase().includes(q) || item.song.artist.toLowerCase().includes(q);
  });

  const activeFolderData = activeFolder !== null ? folders.find(f => f.id === activeFolder) : null;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Header */}
      <div className="bg-bg-secondary border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-accent tracking-tight">MixBoard</span>
            <span className="text-[10px] text-text-muted bg-bg-tertiary px-1.5 py-0.5 rounded">SESSION</span>
          </div>
          <h1 className="text-lg font-bold text-text-primary mt-1">{session.name}</h1>
          <p className="text-xs text-text-muted">{session.items.length} songs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-bg-secondary border-b border-border">
        <div className="max-w-lg mx-auto flex">
          <button
            onClick={() => setActiveTab('songs')}
            className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'songs'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            Songs
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'notes'
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            Notas
            {session.notes && session.notes.length > 0 && (
              <span className="ml-1 text-[10px] bg-bg-tertiary px-1 py-0.5 rounded">
                {session.notes.length}
              </span>
            )}
          </button>
          {session.allow_suggestions && (
            <button
              onClick={() => setActiveTab('suggest')}
              className={`flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'suggest'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              Suggest
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto">
        {activeTab === 'songs' ? (
          <div>
            {/* Folder chips (read-only) */}
            {folders.length > 0 && (
              <FolderChips
                folders={folders}
                activeFolder={activeFolder}
                onFolderChange={setActiveFolder}
                totalItems={session.items.length}
                folderItemCounts={folderItemCounts}
                readOnly
              />
            )}

            {/* Search */}
            <div className="p-3">
              <div className="relative">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={activeFolderData ? `Search in ${activeFolderData.name}...` : 'Search songs...'}
                  className="w-full bg-bg-secondary border border-border/60 rounded-md pl-9 pr-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/60 placeholder:text-text-muted/50 transition-colors"
                />
              </div>
            </div>

            {/* Song list */}
            <div>
              {filtered.map(item => {
                const itemFolder = item.folder_id ? folders.find(f => f.id === item.folder_id) : null;
                const displayPos = activeFolder ? (item.folder_position ?? 0) + 1 : item.position + 1;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/30 transition-colors ${
                      item.is_played ? 'opacity-40' : ''
                    }`}
                  >
                    <span className="text-xs text-text-muted w-5 text-center tabular-nums">{displayPos}</span>
                    {activeFolder === null && itemFolder && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: itemFolder.color, boxShadow: `0 0 4px ${itemFolder.color}40` }}
                        title={itemFolder.name}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-text-primary truncate block leading-tight">{item.song.title}</span>
                      <span className="text-xs text-text-muted truncate block leading-tight">{item.song.artist}</span>
                    </div>
                    <span className="text-xs text-text-muted font-mono tabular-nums">{formatDuration(item.song.duration_seconds)}</span>
                    {item.is_played && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success font-medium">played</span>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && visibleItems.length > 0 && (
                <div className="py-8 text-center text-text-muted text-sm">No matches</div>
              )}
              {visibleItems.length === 0 && activeFolder !== null && (
                <div className="py-10 text-center">
                  <svg width="32" height="32" viewBox="0 0 16 16" fill="none" className="mx-auto mb-2 text-text-muted/30">
                    <path d="M2 3.5A1.5 1.5 0 013.5 2h2.879a1.5 1.5 0 011.06.44l.622.621a1.5 1.5 0 001.06.439H12.5A1.5 1.5 0 0114 5v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  <p className="text-text-muted text-sm">No songs in this folder</p>
                </div>
              )}
              {session.items.length === 0 && (
                <div className="py-8 text-center text-text-muted text-sm">No songs in this session yet.</div>
              )}
            </div>
          </div>
        ) : activeTab === 'notes' ? (
          <NotesSection
            sessionId={session.id}
            notes={session.notes || []}
            onRefresh={onRefresh}
          />
        ) : (
          <SuggestionForm sessionId={session.id} onSubmitted={onRefresh} />
        )}
      </div>
    </div>
  );
}
