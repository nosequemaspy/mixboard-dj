import { useEffect, useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import { CreateSessionModal } from './CreateSessionModal';
import { DuplicateSessionModal } from './DuplicateSessionModal';
import { AddSongToSessionModal } from './AddSongToSessionModal';
import { PasswordPrompt } from './PasswordPrompt';
import { SessionDetail } from './SessionDetail';

export function SessionPanel() {
  const {
    sessions, activeSessionId, activeSession,
    fetchSessions, setActiveSession, fetchActiveSession,
    getPassword, setPassword,
  } = useSessionStore();
  const songs = useLibraryStore(s => s.songs);
  const fetchSongs = useLibraryStore(s => s.fetchSongs);

  const [showCreate, setShowCreate] = useState(false);
  const [showAddSong, setShowAddSong] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<number | null>(null);
  const [passwordError, setPasswordError] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    fetchSessions();
    // Ensure songs are loaded for Add Song modal
    if (songs.length === 0) {
      fetchSongs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectSession = (id: number) => {
    const session = sessions.find(s => s.id === id);
    if (session?.has_password && !getPassword(id)) {
      setPendingSessionId(id);
      setPasswordError('');
      setShowPasswordPrompt(true);
    } else {
      setActiveSession(id);
      setShowSidebar(false);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!pendingSessionId) return;
    try {
      await api.verifySessionPassword(pendingSessionId, password);
      setPassword(pendingSessionId, password);
      setShowPasswordPrompt(false);
      setActiveSession(pendingSessionId);
      setPendingSessionId(null);
    } catch {
      setPasswordError('Invalid password');
    }
  };

  const handleCreate = async (data: { name: string; password?: string; is_public: boolean; allow_suggestions: boolean }) => {
    try {
      const session = await api.createSession(data);
      if (data.password) {
        setPassword(session.id, data.password);
      }
      setShowCreate(false);
      await fetchSessions();
      setActiveSession(session.id);
    } catch {
      // API error already handled by request()
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const pw = getPassword(id);
      await api.deleteSession(id, pw);
      if (activeSessionId === id) setActiveSession(null);
      fetchSessions();
    } catch {
      // ignore - password may be wrong
    }
  };

  const handleAddSong = async (songId: number) => {
    if (!activeSessionId) return;
    try {
      const pw = getPassword(activeSessionId);
      await api.addSessionItem(activeSessionId, { song_id: songId }, pw);
      refreshActiveSession();
    } catch {
      // ignore
    }
  };

  const handleAddAllSongs = async (songIds: number[]) => {
    if (!activeSessionId) return;
    const pw = getPassword(activeSessionId);
    for (const songId of songIds) {
      try {
        await api.addSessionItem(activeSessionId, { song_id: songId }, pw);
      } catch {
        // ignore individual failures
      }
    }
    refreshActiveSession();
  };

  const handleDuplicate = async (data: { name: string; password?: string; is_public: boolean }) => {
    if (!activeSessionId) return;
    try {
      const pw = getPassword(activeSessionId);
      const newSession = await api.duplicateSession(activeSessionId, data, pw);
      if (data.password) {
        setPassword(newSession.id, data.password);
      }
      setShowDuplicate(false);
      await fetchSessions();
      setActiveSession(newSession.id);
    } catch {
      // ignore
    }
  };

  const refreshActiveSession = () => {
    if (activeSessionId) {
      fetchActiveSession(activeSessionId);
      fetchSessions();
    }
  };

  const existingItemSongIds = activeSession
    ? activeSession.items.map(i => i.song_id)
    : [];

  return (
    <div className="flex h-full bg-bg-secondary">
      {/* Mobile session toggle */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="md:hidden fixed bottom-4 left-4 z-40 bg-accent text-white rounded-full w-10 h-10 flex items-center justify-center shadow-lg"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </button>

      {/* Session list sidebar */}
      <div className={`${showSidebar ? 'fixed inset-0 z-30 bg-bg-primary/80 md:relative md:bg-transparent' : 'hidden md:flex'} md:flex`}>
        <div className={`w-56 border-r border-border flex flex-col bg-bg-secondary ${showSidebar ? 'h-full' : ''}`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Sessions</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(true)}>+</Button>
              {showSidebar && (
                <button onClick={() => setShowSidebar(false)} className="md:hidden text-text-muted hover:text-text-primary p-1">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                onContextMenu={e => { e.preventDefault(); if (confirm(`Delete "${s.name}"?`)) handleDelete(s.id); }}
                className={`px-3 py-2 cursor-pointer border-b border-border/30 transition-colors ${
                  s.id === activeSessionId ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-bg-hover'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-sm text-text-primary truncate flex-1">{s.name}</span>
                  {s.has_password && <span className="text-[10px] text-text-muted">&#128274;</span>}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                  <span>{s.item_count} songs</span>
                  {s.pending_suggestions > 0 && (
                    <span className="px-1 py-0.5 rounded-full bg-danger text-white font-bold">
                      {s.pending_suggestions}
                    </span>
                  )}
                  {s.is_public && <span className="text-success">public</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Backdrop click to close on mobile */}
        {showSidebar && <div className="flex-1 md:hidden" onClick={() => setShowSidebar(false)} />}
      </div>

      {/* Active session detail */}
      {activeSession ? (
        <SessionDetail
          session={activeSession}
          password={getPassword(activeSessionId!)}
          onUpdate={refreshActiveSession}
          onAddSong={() => setShowAddSong(true)}
          onDuplicate={() => setShowDuplicate(true)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
          Select or create a session
        </div>
      )}

      {/* Modals */}
      <CreateSessionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
      <AddSongToSessionModal
        open={showAddSong}
        onClose={() => setShowAddSong(false)}
        songs={songs}
        onAdd={handleAddSong}
        onAddAll={handleAddAllSongs}
        existingItemSongIds={existingItemSongIds}
      />
      {activeSession && (
        <DuplicateSessionModal
          open={showDuplicate}
          onClose={() => setShowDuplicate(false)}
          originalName={activeSession.name}
          onDuplicate={handleDuplicate}
        />
      )}
      <PasswordPrompt
        open={showPasswordPrompt}
        onClose={() => { setShowPasswordPrompt(false); setPendingSessionId(null); }}
        onSubmit={handlePasswordSubmit}
        error={passwordError}
      />
    </div>
  );
}
