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
import { InstallPrompt } from '../shared/InstallPrompt';

export function PlayerLayout() {
  const navigate = useNavigate();
  usePlaybackEngine();
  useWebSocket();

  const sessions = useSessionStore(s => s.sessions);
  const activeSessionId = useSessionStore(s => s.activeSessionId);
  const activeSession = useSessionStore(s => s.activeSession);
  const playerSessionId = usePlayerStore(s => s.sessionId);
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

        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Session picker dropdown */}
      {showSessionPicker && (
        <div className="absolute top-12 left-0 right-0 z-40 bg-bg-secondary border-b border-border shadow-lg max-h-64 overflow-y-auto">
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
        <div className="fixed inset-0 z-30" onClick={() => setShowSessionPicker(false)} />
      )}

      {activeSession ? (
        <>
          {/* Now Playing */}
          <div className="flex-shrink-0 border-b border-border">
            <NowPlaying />
          </div>

          {/* Controls */}
          <div className="flex-shrink-0 border-b border-border bg-bg-secondary">
            <PlayerControls />
          </div>

          {/* Playlist */}
          <PlayerPlaylist />
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
