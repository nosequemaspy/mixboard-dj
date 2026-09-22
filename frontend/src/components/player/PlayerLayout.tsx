import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { usePlaybackEngine } from '../../hooks/usePlaybackEngine';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useRemoteControl } from '../../hooks/useRemoteControl';
import { useMediaSession } from '../../hooks/useMediaSession';
import { NowPlaying } from './NowPlaying';
import { PlayerControls } from './PlayerControls';
import { PlayerPlaylist } from './PlayerPlaylist';
import { SessionSongEditor } from './SessionSongEditor';
import { InstallPrompt } from '../shared/InstallPrompt';

export function PlayerLayout() {
  const navigate = useNavigate();
  usePlaybackEngine();
  useWebSocket();

  const sessions = useSessionStore(s => s.sessions);
  const activeSessionId = useSessionStore(s => s.activeSessionId);
  const activeSession = useSessionStore(s => s.activeSession);
  const playerSessionId = usePlayerStore(s => s.sessionId);
  const restrictedMode = usePlayerStore(s => s.restrictedMode);
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const isTransitioning = usePlayerStore(s => s.isTransitioning);
  const nextTransitionSongTitle = usePlayerStore(s => s.nextTransitionSongTitle);
  const [showSessionPicker, setShowSessionPicker] = useState(false);

  // Remote control: this is the HOST (plays audio)
  useRemoteControl(playerSessionId, 'host');
  useMediaSession();

  // Fetch sessions on mount
  useEffect(() => {
    useSessionStore.getState().fetchSessions();
    useSessionStore.getState().restoreLastSession();
  }, []);

  // Sync player store when session data loads/changes
  useEffect(() => {
    if (activeSession && activeSessionId) {
      if (playerSessionId !== activeSessionId) {
        usePlayerStore.getState().loadSession(activeSessionId);
      } else {
        usePlayerStore.getState().syncFromSessionStore();
      }
    }
  }, [activeSession, activeSessionId, playerSessionId]);

  const handleSelectSession = (id: number) => {
    useSessionStore.getState().setActiveSession(id);
    setShowSessionPicker(false);
  };

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Header bar */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-bg-secondary border-b border-border flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-text-secondary hover:text-text-primary transition-colors min-h-[40px] px-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-sm">DJ</span>
        </button>

        {/* Session selector */}
        <button
          onClick={() => setShowSessionPicker(!showSessionPicker)}
          className="text-sm font-medium text-text-primary hover:text-accent transition-colors truncate max-w-[200px] min-h-[40px] flex items-center px-2"
        >
          {activeSession?.name || 'Seleccionar sesion'}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-1 flex-shrink-0">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Restricted / Editable mode toggle */}
        <button
          onClick={() => usePlayerStore.getState().toggleRestrictedMode()}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium min-h-[36px] transition-colors ${
            restrictedMode
              ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
              : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
          }`}
        >
          {restrictedMode ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
          {restrictedMode ? 'Restringido' : 'Editable'}
        </button>
      </header>

      {/* Session picker dropdown */}
      {showSessionPicker && (
        <div className="absolute top-12 left-0 right-0 z-[51] bg-bg-secondary border-b border-border shadow-lg max-h-64 overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-text-muted">No hay sesiones</p>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                onClick={() => handleSelectSession(s.id)}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-bg-tertiary transition-colors border-b border-border/50 min-h-[48px] ${
                  s.id === activeSessionId ? 'text-accent bg-accent/5' : 'text-text-primary'
                }`}
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-text-muted ml-2">({s.item_count} canciones)</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Close dropdown on tap outside */}
      {showSessionPicker && (
        <div className="fixed inset-0 z-50" onClick={() => setShowSessionPicker(false)} />
      )}

      {activeSession ? (
        <>
          {!restrictedMode && currentItemId ? (
            // Full editor mode
            <SessionSongEditor />
          ) : (
            // Compact mode (restricted or no song)
            <>
              <div className="flex-shrink-0 border-b border-border">
                <NowPlaying />
              </div>
              <PlayerPlaylist />
            </>
          )}

          {/* Transition indicator */}
          {isTransitioning && nextTransitionSongTitle && (
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-accent/10 border-b border-accent/20">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
              </span>
              <span className="text-xs text-accent font-medium truncate">
                Cambiando a {nextTransitionSongTitle}...
              </span>
            </div>
          )}

          {/* Controls (always visible) */}
          <div className="flex-shrink-0 border-b border-border bg-bg-secondary">
            <PlayerControls />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-text-muted text-sm mb-3">Selecciona una sesion para empezar</p>
            <button
              onClick={() => setShowSessionPicker(true)}
              className="px-4 py-2.5 bg-accent text-white rounded-md text-sm hover:bg-accent-hover transition-colors min-h-[44px]"
            >
              Elegir sesion
            </button>
          </div>
        </div>
      )}

      <InstallPrompt />
    </div>
  );
}
