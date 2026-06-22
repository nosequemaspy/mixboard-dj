import { useState } from 'react';
import type { SessionData } from '../../types';
import { SuggestionForm } from './SuggestionForm';
import { NotesSection } from './NotesSection';

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

  const filtered = session.items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.song.title.toLowerCase().includes(q) || item.song.artist.toLowerCase().includes(q);
  });

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
            {/* Search */}
            <div className="p-3">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search songs..."
                className="w-full bg-bg-secondary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
            </div>

            {/* Song list */}
            <div>
              {filtered.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/30 ${
                    item.is_played ? 'opacity-40' : ''
                  }`}
                >
                  <span className="text-xs text-text-muted w-5 text-center">{item.position + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-text-primary truncate block">{item.song.title}</span>
                    <span className="text-xs text-text-muted truncate block">{item.song.artist}</span>
                  </div>
                  <span className="text-xs text-text-muted font-mono">{formatDuration(item.song.duration_seconds)}</span>
                  {item.is_played && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">played</span>
                  )}
                </div>
              ))}
              {filtered.length === 0 && session.items.length > 0 && (
                <div className="py-8 text-center text-text-muted text-sm">No matches</div>
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
