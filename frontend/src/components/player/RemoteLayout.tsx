import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useRemoteControl } from '../../hooks/useRemoteControl';
function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RemoteLayout() {
  const navigate = useNavigate();
  useWebSocket();

  const sessions = useSessionStore(s => s.sessions);
  const activeSessionId = useSessionStore(s => s.activeSessionId);
  const activeSession = useSessionStore(s => s.activeSession);
  const playerSessionId = usePlayerStore(s => s.sessionId);
  const [showSessionPicker, setShowSessionPicker] = useState(false);

  const currentItemId = usePlayerStore(s => s.currentItemId);
  const currentSongId = usePlayerStore(s => s.currentSongId);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const shuffleEnabled = usePlayerStore(s => s.shuffleEnabled);
  const playedSongIds = usePlayerStore(s => s.playedSongIds);
  const sessionItems = usePlayerStore(s => s.sessionItems);
  const activeTagId = usePlayerStore(s => s.activeTagId);
  const folders = usePlayerStore(s => s.folders);

  // Remote control: this is a REMOTE (sends commands, no audio)
  const { sendCommand } = useRemoteControl(playerSessionId, 'remote');

  // Fetch sessions on mount
  useEffect(() => {
    useSessionStore.getState().fetchSessions();
    useSessionStore.getState().restoreLastSession();
  }, []);

  // Load session data
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

  const currentItem = sessionItems.find(i => i.song_id === currentSongId);
  const song = currentItem?.song;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const filteredItems = usePlayerStore.getState().getFilteredItems();

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = (parseFloat(e.target.value) / 100) * duration;
    sendCommand('seek', { time });
  };

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Header */}
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

        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Control remoto</span>
          <button
            onClick={() => setShowSessionPicker(!showSessionPicker)}
            className="text-sm font-medium text-text-primary hover:text-accent transition-colors truncate max-w-[160px] min-h-[40px] flex items-center px-2"
          >
            {activeSession?.name || 'Seleccionar'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-1 flex-shrink-0">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        <div className="w-10" />
      </header>

      {/* Session picker */}
      {showSessionPicker && (
        <>
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
          <div className="fixed inset-0 z-30" onClick={() => setShowSessionPicker(false)} />
        </>
      )}

      {activeSession ? (
        <>
          {/* Now Playing */}
          <div className="px-4 py-5 flex-shrink-0 border-b border-border">
            {song ? (
              <>
                <div className="text-center mb-4">
                  <h2 className="text-lg font-bold text-text-primary truncate">{song.title}</h2>
                  <p className="text-sm text-text-secondary truncate">{song.artist || 'Unknown Artist'}</p>
                </div>

                <div className="relative">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={progress}
                    onChange={handleSeek}
                    className="w-full h-2 cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, var(--color-accent) ${progress}%, var(--color-bg-tertiary) ${progress}%)`,
                    }}
                  />
                </div>

                <div className="flex justify-between mt-1.5 text-xs text-text-muted font-mono">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-text-muted text-sm">Esperando reproduccion del host...</p>
              </div>
            )}
          </div>

          {/* Remote Controls */}
          <div className="flex items-center justify-center gap-6 py-3 px-4 flex-shrink-0 border-b border-border bg-bg-secondary">
            {/* Shuffle */}
            <button
              onClick={() => sendCommand('shuffle')}
              className={`p-3 rounded-full transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center ${
                shuffleEnabled
                  ? 'text-accent bg-accent/15'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
              }`}
              title={shuffleEnabled ? 'Desactivar aleatorio' : 'Activar aleatorio'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8" />
                <line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" />
                <line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </button>

            {/* Previous */}
            <button
              onClick={() => sendCommand('previous')}
              className="p-3 rounded-full text-text-primary hover:bg-bg-tertiary transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
              title="Anterior"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={() => sendCommand('toggle')}
              className="w-16 h-16 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors shadow-lg"
              title={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                </svg>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Next */}
            <button
              onClick={() => sendCommand('next')}
              className="p-3 rounded-full text-text-primary hover:bg-bg-tertiary transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
              title="Siguiente"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* Reset played */}
            <button
              onClick={() => sendCommand('reset_played')}
              className="p-3 rounded-full text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
              title="Reactivar canciones"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          </div>

          {/* Tags */}
          <div className="px-4 py-2 border-b border-border overflow-x-auto flex-shrink-0">
            <div className="flex gap-1.5 flex-nowrap">
              <button
                onClick={() => sendCommand('set_tag', { tagId: null })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors min-h-[36px] ${
                  activeTagId === null
                    ? 'bg-accent text-white'
                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                }`}
              >
                Todas
              </button>
              {folders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => sendCommand('set_tag', { tagId: folder.id })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors min-h-[36px] ${
                    activeTagId === folder.id
                      ? 'text-white'
                      : 'text-text-secondary hover:opacity-80'
                  }`}
                  style={{
                    backgroundColor: activeTagId === folder.id
                      ? folder.color
                      : `${folder.color}20`,
                  }}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          </div>

          {/* Song list */}
          <div className="flex-1 overflow-y-auto">
            <div className="py-1">
              {filteredItems.map((item, index) => {
                const isPlayed = playedSongIds.has(item.song_id);
                const isCurrent = item.id === currentItemId;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-4 py-2 transition-colors ${
                      isCurrent ? 'bg-accent/10' : 'hover:bg-bg-tertiary'
                    }`}
                  >
                    <div className="w-8 text-center flex-shrink-0">
                      {isCurrent ? (
                        <span className="text-accent text-sm font-bold">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="inline">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      ) : (
                        <span className={`text-xs font-mono ${isPlayed ? 'text-text-muted/40' : 'text-text-muted'}`}>
                          {index + 1}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => sendCommand('play_item', { itemId: item.id })}
                      className={`flex-1 text-left min-w-0 min-h-[44px] flex flex-col justify-center ${
                        isPlayed && !isCurrent ? 'opacity-40' : ''
                      }`}
                    >
                      <p className={`text-sm truncate ${
                        isCurrent ? 'text-accent font-medium' : 'text-text-primary'
                      } ${isPlayed && !isCurrent ? 'line-through' : ''}`}>
                        {item.song.title}
                      </p>
                      <p className="text-xs text-text-muted truncate">{item.song.artist}</p>
                    </button>

                    <span className={`text-xs font-mono flex-shrink-0 ${isPlayed ? 'text-text-muted/40' : 'text-text-muted'}`}>
                      {formatTime(item.song.duration_seconds)}
                    </span>

                    <button
                      onClick={() => sendCommand('add_to_queue', { itemId: item.id })}
                      className="p-2 text-text-muted hover:text-accent transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center flex-shrink-0"
                      title="Agregar a la cola"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <p className="text-text-muted text-sm mb-3">Selecciona la misma sesion que el PC host</p>
            <button
              onClick={() => setShowSessionPicker(true)}
              className="px-4 py-2.5 bg-accent text-white rounded-md text-sm hover:bg-accent-hover transition-colors min-h-[44px]"
            >
              Elegir sesion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
