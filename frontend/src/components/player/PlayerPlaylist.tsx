import { useState, useMemo } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { QueueSection } from './QueueSection';
import { SongSettingsModal } from './SongSettingsModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { InlineTransitionEditor } from '../shared/InlineTransitionEditor';
import type { SessionItem } from '../../types';
import { getEffectivePlaybackSettings } from '../../types';

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlayerPlaylist() {
  const activeTagId = usePlayerStore(s => s.activeTagId);
  const folders = usePlayerStore(s => s.folders);
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const playedSongIds = usePlayerStore(s => s.playedSongIds);
  const currentTime = usePlayerStore(s => s.currentTime);
  const restrictedMode = usePlayerStore(s => s.restrictedMode);
  const [settingsItem, setSettingsItem] = useState<SessionItem | null>(null);
  const [timeUntilItemId, setTimeUntilItemId] = useState<number | null>(null);
  const [quickEditItemId, setQuickEditItemId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const filteredItems = usePlayerStore.getState().getFilteredItems();
  const nextUpItem = currentItemId ? usePlayerStore.getState().getNextItem() : null;

  // Calculate total playlist time and time until selected song
  const { totalDuration, totalRemaining, timeUntilSong } = useMemo(() => {
    let total = 0;
    let remaining = 0;
    let timeUntil = 0;
    let foundCurrent = false;
    let foundTarget = false;
    const currentIdx = filteredItems.findIndex(i => i.id === currentItemId);

    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      const eff = getEffectivePlaybackSettings(item);
      const start = eff.start_time;
      const end = eff.end_time ?? item.song.duration_seconds;
      const effectiveDuration = Math.max(0, end - start);
      const speed = eff.playback_speed;
      const adjustedDuration = speed > 0 ? effectiveDuration / speed : effectiveDuration;

      total += adjustedDuration;

      // Calculate remaining time from current position
      if (i === currentIdx) {
        foundCurrent = true;
        // Add remaining time of current song
        const currentRemaining = Math.max(0, adjustedDuration - (currentTime - start) / (speed > 0 ? speed : 1));
        remaining += currentRemaining;
      } else if (foundCurrent && !playedSongIds.has(item.song_id)) {
        remaining += adjustedDuration;
      }

      // Calculate time until target song
      if (timeUntilItemId !== null) {
        if (item.id === timeUntilItemId) {
          foundTarget = true;
        } else if (!foundTarget) {
          if (i === currentIdx) {
            const currentRemaining = Math.max(0, adjustedDuration - (currentTime - start) / (speed > 0 ? speed : 1));
            timeUntil += currentRemaining;
          } else if (i > currentIdx && !playedSongIds.has(item.song_id)) {
            timeUntil += adjustedDuration;
          }
        }
      }
    }

    return {
      totalDuration: total,
      totalRemaining: remaining,
      timeUntilSong: timeUntilItemId !== null ? timeUntil : null,
    };
  }, [filteredItems, currentItemId, currentTime, playedSongIds, timeUntilItemId]);

  const handleTimeUntilToggle = (itemId: number) => {
    setTimeUntilItemId(prev => prev === itemId ? null : itemId);
  };

  const handleTagClick = (tagId: number | null) => {
    usePlayerStore.getState().setActiveTag(tagId);
  };

  const handlePlayItem = (item: SessionItem) => {
    if (restrictedMode) {
      setConfirmAction({
        title: 'Reproducir cancion',
        message: `Reproducir "${item.song.title}"?`,
        action: () => usePlayerStore.getState().playItem(item),
      });
      return;
    }
    usePlayerStore.getState().playItem(item);
  };

  const handleAddToQueue = (item: SessionItem) => {
    if (restrictedMode) {
      setConfirmAction({
        title: 'Agregar a la cola',
        message: `Agregar "${item.song.title}" a la cola?`,
        action: () => {
          usePlayerStore.getState().addToQueue(item);
          setToastMessage(`"${item.song.title}" agregada a la cola`);
          setTimeout(() => setToastMessage(null), 2500);
        },
      });
      return;
    }
    usePlayerStore.getState().addToQueue(item);
  };

  const handleResetPlayed = () => {
    if (restrictedMode) {
      setConfirmAction({
        title: 'Reactivar canciones',
        message: 'Reactivar todas las canciones reproducidas?',
        action: () => usePlayerStore.getState().resetAllPlayed(),
      });
      return;
    }
    usePlayerStore.getState().resetAllPlayed();
  };

  const playedCount = filteredItems.filter(i => playedSongIds.has(i.song_id)).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tag chips */}
      <div className="px-4 py-2 border-b border-border overflow-x-auto flex-shrink-0">
        <div className="flex gap-1.5 flex-nowrap">
          <button
            onClick={() => handleTagClick(null)}
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
              onClick={() => handleTagClick(folder.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors min-h-[36px] ${
                activeTagId === folder.id
                  ? 'text-white'
                  : 'text-text-secondary hover:opacity-80'
              }`}
              style={{
                backgroundColor: activeTagId === folder.id
                  ? folder.color
                  : `${folder.color}20`,
                borderColor: folder.color,
              }}
            >
              {folder.name}
            </button>
          ))}
        </div>
      </div>

      {/* Playlist time info */}
      <div className="px-4 py-1.5 border-b border-border flex items-center gap-3 text-xs text-text-muted font-mono flex-shrink-0 flex-wrap">
        <span title="Duración total">Total: {formatDuration(totalDuration)}</span>
        {currentItemId && (
          <span title="Tiempo restante">Restante: {formatDuration(totalRemaining)}</span>
        )}
        {timeUntilSong !== null && timeUntilItemId !== null && (
          <span className="text-accent" title="Tiempo hasta canción seleccionada">
            Hasta #{filteredItems.findIndex(i => i.id === timeUntilItemId) + 1}: {formatDuration(timeUntilSong)}
          </span>
        )}
      </div>

      {/* Queue */}
      <QueueSection />

      {/* Played status bar */}
      {playedCount > 0 && (
        <div className="px-4 py-2 flex items-center justify-between border-b border-border flex-shrink-0">
          <span className="text-xs text-text-muted">
            {playedCount}/{filteredItems.length} reproducidas
          </span>
          <button
            onClick={handleResetPlayed}
            className="text-xs text-accent hover:text-accent-hover transition-colors px-2 py-1 min-h-[32px]"
          >
            Reactivar canciones
          </button>
        </div>
      )}

      {/* Song list */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-text-muted text-sm">
            No hay canciones en esta vista
          </div>
        ) : (
          <div className="py-1">
            {filteredItems.map((item, index) => {
              const isPlayed = playedSongIds.has(item.song_id);
              const isCurrent = item.id === currentItemId;
              const isNext = nextUpItem?.id === item.id && !isCurrent;
              const isQuickEditing = quickEditItemId === item.id;

              return (
                <div key={item.id}>
                  <div
                    className={`flex items-center gap-2 px-4 py-2 transition-colors ${
                      isCurrent
                        ? 'bg-accent/10'
                        : isNext
                          ? 'bg-accent/5 border-l-2 border-l-accent/40'
                          : 'hover:bg-bg-tertiary'
                    }`}
                  >
                    {/* Index / playing indicator */}
                    <div className="w-8 text-center flex-shrink-0">
                      {isCurrent ? (
                        <span className="text-accent text-sm font-bold">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="inline">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      ) : isNext ? (
                        <span className="text-accent/60 text-[10px] font-bold uppercase">SIG</span>
                      ) : (
                        <span className={`text-xs font-mono ${isPlayed ? 'text-text-muted/40' : 'text-text-muted'}`}>
                          {index + 1}
                        </span>
                      )}
                    </div>

                    {/* Song info — tappable to play */}
                    <button
                      onClick={() => handlePlayItem(item)}
                      className={`flex-1 text-left min-w-0 min-h-[44px] flex flex-col justify-center ${
                        isPlayed && !isCurrent && !isNext ? 'opacity-40' : ''
                      }`}
                    >
                      <p className={`text-sm truncate ${
                        isCurrent ? 'text-accent font-medium' : isNext ? 'text-text-primary font-medium' : 'text-text-primary'
                      } ${isPlayed && !isCurrent ? 'line-through' : ''}`}>
                        {item.song.title}
                      </p>
                      <p className="text-xs text-text-muted truncate">{item.song.artist}</p>
                    </button>

                    {/* Duration */}
                    <span className={`text-xs font-mono flex-shrink-0 ${isPlayed ? 'text-text-muted/40' : 'text-text-muted'}`}>
                      {formatTime(item.song.duration_seconds)}
                    </span>

                    {/* Quick transition editor toggle */}
                    {!restrictedMode && (
                      <button
                        onClick={() => setQuickEditItemId(isQuickEditing ? null : item.id)}
                        className={`p-2 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center flex-shrink-0 ${
                          isQuickEditing ? 'text-accent' : 'text-text-muted hover:text-accent'
                        }`}
                        title="Editar transicion"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="4" y1="21" x2="4" y2="14" />
                          <line x1="4" y1="10" x2="4" y2="3" />
                          <line x1="12" y1="21" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12" y2="3" />
                          <line x1="20" y1="21" x2="20" y2="16" />
                          <line x1="20" y1="12" x2="20" y2="3" />
                          <line x1="1" y1="14" x2="7" y2="14" />
                          <line x1="9" y1="8" x2="15" y2="8" />
                          <line x1="17" y1="16" x2="23" y2="16" />
                        </svg>
                      </button>
                    )}

                    {/* Time until this song */}
                    {!isCurrent && (
                      <button
                        onClick={() => handleTimeUntilToggle(item.id)}
                        className={`p-2 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center flex-shrink-0 ${
                          timeUntilItemId === item.id ? 'text-accent' : 'text-text-muted hover:text-accent'
                        }`}
                        title="Ver tiempo hasta esta cancion"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </button>
                    )}

                    {/* Add to queue */}
                    <button
                      onClick={() => handleAddToQueue(item)}
                      className="p-2 text-text-muted hover:text-accent transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center flex-shrink-0"
                      title="Agregar a la cola"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>

                    {/* Settings */}
                    {!restrictedMode && (
                      <button
                        onClick={() => setSettingsItem(item)}
                        className="p-2 text-text-muted hover:text-text-primary transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center flex-shrink-0"
                        title="Ajustes"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Inline transition editor */}
                  {isQuickEditing && (
                    <InlineTransitionEditor
                      item={item}
                      nextItem={filteredItems[index + 1] ?? null}
                      onClose={() => setQuickEditItemId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings modal */}
      {settingsItem && (
        <SongSettingsModal
          item={settingsItem}
          onClose={() => setSettingsItem(null)}
        />
      )}

      {/* Confirmation dialog for restricted mode */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        onConfirm={() => {
          confirmAction?.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
