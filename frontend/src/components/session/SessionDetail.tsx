import { useState, useRef, useEffect, useMemo } from 'react';
import type { SessionData } from '../../types';
import { getEffectivePlaybackSettings } from '../../types';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import { SessionSongList } from './SessionSongList';
import { TagSidebar } from './FolderChips';
import { SuggestionReview } from './SuggestionReview';
import { NowPlaying } from '../player/NowPlaying';
import { DeckABView } from '../player/DeckABView';
import { PlayerControls } from '../player/PlayerControls';
import { QueueSection } from '../player/QueueSection';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';

interface SessionDetailProps {
  session: SessionData;
  password?: string;
  onUpdate: () => void;
  onAddSong: () => void;
  onDuplicate: () => void;
}

type Tab = 'songs' | 'suggestions' | 'notes';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SessionNowPlaying() {
  const isTransitioning = usePlayerStore(s => s.isTransitioning);
  const nextTransitionSongTitle = usePlayerStore(s => s.nextTransitionSongTitle);

  return (
    <div>
      {isTransitioning && nextTransitionSongTitle && (
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
          </span>
          <span className="text-xs text-accent font-medium truncate">
            Transicionando a {nextTransitionSongTitle}...
          </span>
        </div>
      )}
      <NowPlaying />
    </div>
  );
}

function SessionTimeInfo({ items }: { items: SessionData['items'] }) {
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const currentTime = usePlayerStore(s => s.currentTime);
  const playedSongIds = usePlayerStore(s => s.playedSongIds);

  const { withTransitions, withoutTransitions, remaining } = useMemo(() => {
    let withTrans = 0;
    let withoutTrans = 0;
    let rem = 0;
    let foundCurrent = false;

    const songItems = items
      .filter(i => i.song && !i.separator_text)
      .sort((a, b) => a.position - b.position);

    for (let i = 0; i < songItems.length; i++) {
      const item = songItems[i];
      const eff = getEffectivePlaybackSettings(item);
      const start = eff.start_time;
      const end = eff.end_time ?? item.song.duration_seconds;
      const speed = eff.playback_speed;
      const transitionDuration = eff.transition_duration;

      const effectiveDuration = Math.max(0, end - start);
      const adjustedDuration = speed > 0 ? effectiveDuration / speed : effectiveDuration;

      // Without transitions: raw duration
      withoutTrans += item.song.duration_seconds;

      // With transitions: adjusted duration minus overlap with next
      const overlap = i < songItems.length - 1 ? transitionDuration : 0;
      withTrans += Math.max(0, adjustedDuration - overlap);

      // Remaining time
      if (item.id === currentItemId) {
        foundCurrent = true;
        const currentRemaining = Math.max(0, adjustedDuration - (currentTime - start) / (speed > 0 ? speed : 1));
        rem += Math.max(0, currentRemaining - overlap);
      } else if (foundCurrent && !playedSongIds.has(item.song_id)) {
        rem += Math.max(0, adjustedDuration - overlap);
      }
    }

    return { withTransitions: withTrans, withoutTransitions: withoutTrans, remaining: rem };
  }, [items, currentItemId, currentTime, playedSongIds]);

  return (
    <div className="px-4 py-1.5 border-t border-border flex items-center gap-3 text-[11px] text-text-muted font-mono flex-wrap">
      <span title="Con transiciones (ajustado por velocidad y crossfade)">
        Con trans: {formatDuration(withTransitions)}
      </span>
      <span title="Sin transiciones (duracion original)">
        Sin trans: {formatDuration(withoutTransitions)}
      </span>
      {currentItemId && (
        <span className="text-accent" title="Tiempo restante desde cancion actual">
          Restante: {formatDuration(remaining)}
        </span>
      )}
    </div>
  );
}

export function SessionDetail({ session, password, onUpdate, onAddSong, onDuplicate }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('songs');
  const [activeFolder, setActiveFolder] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerActive = usePlayerStore(s => s.sessionPlayerActive);
  const restrictedMode = usePlayerStore(s => s.restrictedMode);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // When player mode is toggled on, sync the session into PlayerStore
  useEffect(() => {
    if (playerActive && session) {
      const playerSessionId = usePlayerStore.getState().sessionId;
      const activeSessionId = useSessionStore.getState().activeSessionId;
      if (activeSessionId && playerSessionId !== activeSessionId) {
        usePlayerStore.getState().loadSession(activeSessionId);
      }
    }
  }, [playerActive, session]);

  const shareUrl = `${window.location.origin}/s/${session.share_code}`;
  const pendingCount = session.suggestions.filter(s => s.status === 'pending').length;
  const notesCount = session.notes?.length || 0;
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

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      await api.deleteNote(session.id, noteId, password);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleCreateNote = async () => {
    if (!noteText.trim() || noteSending) return;
    setNoteSending(true);
    try {
      await api.createNote(session.id, { content: noteText.trim(), author_name: 'DJ' });
      setNoteText('');
      onUpdate();
    } catch {
      // ignore
    } finally {
      setNoteSending(false);
    }
  };

  const handleCreateFolder = async (name: string, color: string) => {
    try {
      await api.createSessionFolder(session.id, { name, color }, password);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    try {
      await api.deleteSessionFolder(session.id, folderId, password);
      if (activeFolder === folderId) setActiveFolder(null);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleRenameFolder = async (folderId: number, name: string, color: string) => {
    try {
      await api.updateSessionFolder(session.id, folderId, { name, color }, password);
      onUpdate();
    } catch {
      // ignore
    }
  };

  const handleTogglePlayer = () => {
    usePlayerStore.getState().toggleSessionPlayer();
  };

  const handleToggleRestricted = () => {
    usePlayerStore.getState().toggleRestrictedMode();
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{session.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-text-muted font-mono">{session.share_code}</span>
            {session.is_public && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">public</span>
            )}
            {session.has_password && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">locked</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Player mode toggle */}
          <button
            onClick={handleTogglePlayer}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium min-h-[32px] transition-colors ${
              playerActive
                ? 'bg-accent/20 text-accent hover:bg-accent/30'
                : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
            }`}
            title={playerActive ? 'Desactivar modo player' : 'Activar modo player'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            Player
          </button>
          {/* Restricted/Editable toggle (only visible when player is active) */}
          {playerActive && (
            <button
              onClick={handleToggleRestricted}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium min-h-[32px] transition-colors ${
                restrictedMode
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
              }`}
            >
              {restrictedMode ? (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              )}
              {restrictedMode ? 'Restringido' : 'Editable'}
            </button>
          )}
          <Button size="sm" variant="ghost" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate}>Duplicate</Button>
          <Button size="sm" variant="primary" onClick={onAddSong}>Add Song</Button>
        </div>
      </div>

      {/* Player UI (when active) */}
      {playerActive && (
        <>
          <div className="flex-shrink-0 border-b border-border">
            {restrictedMode ? <DeckABView /> : <SessionNowPlaying />}
          </div>
          <div className="flex-shrink-0 border-b border-border bg-bg-secondary">
            <PlayerControls />
          </div>
        </>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        <button
          onClick={() => setActiveTab('songs')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'songs'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Songs ({session.items.length})
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'notes'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Notas
          {notesCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 text-[10px] font-bold rounded-full bg-accent/20 text-accent px-1">
              {notesCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors relative ${
            activeTab === 'suggestions'
              ? 'border-accent text-accent'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Suggestions
          {pendingCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-danger text-white">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Queue (when player active and on songs tab) */}
      {playerActive && activeTab === 'songs' && (
        <div className="flex-shrink-0">
          <QueueSection />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'songs' ? (
          <div className="flex h-full">
            {/* Tag sidebar */}
            <TagSidebar
              folders={folders}
              activeFolder={activeFolder}
              onFolderChange={setActiveFolder}
              totalItems={session.items.length}
              folderItemCounts={folderItemCounts}
              onCreate={handleCreateFolder}
              onDelete={handleDeleteFolder}
              onRename={handleRenameFolder}
            />
            {/* Song list */}
            <div className="flex-1 min-w-0">
              <SessionSongList
                items={session.items}
                sessionId={session.id}
                password={password}
                onUpdate={onUpdate}
                folders={folders}
                activeFolder={activeFolder}
                playerActive={playerActive}
              />
            </div>
          </div>
        ) : activeTab === 'notes' ? (
          <div className="h-full flex flex-col">
            {/* Note creation form */}
            <div className="px-3 pt-3 pb-2 border-b border-border/30">
              <div className="flex gap-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCreateNote(); }}
                  placeholder="Write a note... (Ctrl+Enter to send)"
                  rows={2}
                  className="flex-1 bg-bg-primary border border-border/60 rounded-md px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/60 resize-none transition-colors"
                />
                <button
                  onClick={handleCreateNote}
                  disabled={!noteText.trim() || noteSending}
                  className="self-end px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-30 text-white text-xs font-medium transition-colors"
                >
                  {noteSending ? '...' : 'Add'}
                </button>
              </div>
            </div>
            {/* Notes list */}
            <div className="flex-1 overflow-y-auto p-3">
              {(session.notes || []).length > 0 ? (
                <div className="space-y-2">
                  {session.notes.map(note => (
                    <div key={note.id} className="bg-bg-primary border border-border/50 rounded-lg p-3 group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-accent">{note.author_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted">{timeAgo(note.created_at)}</span>
                          <button
                            onClick={() => handleDeleteNote(note.id)}
                            className="text-[10px] text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            delete
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-text-primary whitespace-pre-wrap break-words">{note.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-text-muted text-sm">
                  No notes yet
                </div>
              )}
            </div>
          </div>
        ) : (
          <SuggestionReview
            suggestions={session.suggestions}
            sessionId={session.id}
            password={password}
            onUpdate={onUpdate}
          />
        )}
      </div>

      {/* Time info (when player active and on songs tab) */}
      {playerActive && activeTab === 'songs' && (
        <div className="flex-shrink-0">
          <SessionTimeInfo items={session.items} />
        </div>
      )}
    </div>
  );
}
