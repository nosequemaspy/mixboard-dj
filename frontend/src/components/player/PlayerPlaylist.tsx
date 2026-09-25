import { useState, useMemo, useRef, useEffect } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useSessionStore } from '../../store/sessionStore';
import { QueueSection } from './QueueSection';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import type { SessionItem, SessionFolder } from '../../types';
import { getEffectivePlaybackSettings, matchesSearch } from '../../types';
import { api } from '../../api/http';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const TAG_COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

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

function FolderDropdown({ folders, currentFolderId, onAssign }: {
  folders: SessionFolder[];
  currentFolderId: number | null;
  onAssign: (folderId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className={`text-xs px-1.5 py-1 min-w-[28px] min-h-[28px] flex items-center justify-center rounded transition-colors ${
          currentFolder
            ? 'hover:brightness-125'
            : 'bg-bg-tertiary/50 text-text-muted hover:text-text-primary'
        }`}
        style={currentFolder ? { backgroundColor: `${currentFolder.color}25`, color: currentFolder.color } : undefined}
        title="Asignar etiqueta"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M2 4.5A1.5 1.5 0 013.5 3h2.379a1.5 1.5 0 011.06.44l.622.62a1.5 1.5 0 001.06.44H12.5A1.5 1.5 0 0114 6v5.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z" stroke="currentColor" strokeWidth="1.3"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-bg-secondary/95 backdrop-blur-sm border border-border/60 rounded-lg shadow-xl py-1 min-w-[150px]">
          <button
            onClick={() => { onAssign(null); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover/80 flex items-center gap-2 transition-colors ${
              currentFolderId === null ? 'text-accent' : 'text-text-primary'
            }`}
          >
            {currentFolderId === null && (
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
              </svg>
            )}
            <span className={currentFolderId === null ? '' : 'ml-[18px]'}>Sin etiqueta</span>
          </button>
          {folders.length > 0 && <div className="mx-2 my-0.5 border-t border-border/30" />}
          {folders.map(f => (
            <button
              key={f.id}
              onClick={() => { onAssign(f.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                currentFolderId === f.id ? '' : 'text-text-primary'
              }`}
              style={{
                color: currentFolderId === f.id ? f.color : undefined,
                backgroundColor: currentFolderId === f.id ? `${f.color}10` : undefined,
              }}
              onMouseEnter={e => { if (currentFolderId !== f.id) (e.currentTarget.style.backgroundColor = `${f.color}0d`); }}
              onMouseLeave={e => { if (currentFolderId !== f.id) (e.currentTarget.style.backgroundColor = ''); }}
            >
              {currentFolderId === f.id ? (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                </svg>
              ) : (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
              )}
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableSongRow({ item, isPlayed, isCurrent, isNext, songIndex, folders, restrictedMode, onPlay, onAddToQueue, onAssignFolder }: {
  item: SessionItem;
  isPlayed: boolean;
  isCurrent: boolean;
  isNext: boolean;
  songIndex: number;
  folders: SessionFolder[];
  restrictedMode: boolean;
  onPlay: (item: SessionItem) => void;
  onAddToQueue: (item: SessionItem) => void;
  onAssignFolder: (itemId: number, folderId: number | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-1.5 px-2 py-2 transition-colors overflow-hidden ${
          isCurrent
            ? 'bg-accent/10'
            : isNext
              ? 'bg-accent/5 border-l-2 border-l-accent/40'
              : 'hover:bg-bg-tertiary'
        }`}
      >
        {/* Drag handle — only in editable mode */}
        {!restrictedMode && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-text-muted/40 hover:text-text-muted px-1 flex-shrink-0 touch-none">
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
              <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
              <circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>
            </svg>
          </div>
        )}

        {/* Index / playing indicator */}
        <div className="w-7 text-center flex-shrink-0">
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
              {songIndex + 1}
            </span>
          )}
        </div>

        {/* Song info — tappable to play */}
        <button
          onClick={() => onPlay(item)}
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

        {/* Folder assign — only in editable mode */}
        {!restrictedMode && (
          <FolderDropdown
            folders={folders}
            currentFolderId={item.folder_id}
            onAssign={(folderId) => onAssignFolder(item.id, folderId)}
          />
        )}

        {/* Add to queue */}
        <button
          onClick={() => onAddToQueue(item)}
          className="p-2 text-text-muted hover:text-accent transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center flex-shrink-0"
          title="Agregar a la cola"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function PlayerPlaylist() {
  const activeTagId = usePlayerStore(s => s.activeTagId);
  const folders = usePlayerStore(s => s.folders);
  const sessionId = usePlayerStore(s => s.sessionId);
  const currentItemId = usePlayerStore(s => s.currentItemId);
  const playedSongIds = usePlayerStore(s => s.playedSongIds);
  const currentTime = usePlayerStore(s => s.currentTime);
  const restrictedMode = usePlayerStore(s => s.restrictedMode);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; action: () => void } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creatingTag && tagInputRef.current) tagInputRef.current.focus();
  }, [creatingTag]);

  const filteredItems = usePlayerStore.getState().getFilteredItems();
  const allItemsWithSeparators = usePlayerStore.getState().getAllItemsWithSeparators();
  const searchedItems = useMemo(() =>
    filteredItems.filter(item => matchesSearch(search, item.song.title, item.song.artist)),
    [filteredItems, search]
  );

  // Build display list: songs with separators inserted at correct positions
  const displayItems = useMemo(() => {
    if (search) return searchedItems.map(item => ({ type: 'song' as const, item }));
    const result: Array<{ type: 'song'; item: SessionItem } | { type: 'separator'; text: string; id: number }> = [];
    for (const item of allItemsWithSeparators) {
      if (item.separator_text) {
        result.push({ type: 'separator', text: item.separator_text, id: item.id });
      } else {
        result.push({ type: 'song', item });
      }
    }
    return result;
  }, [allItemsWithSeparators, search, searchedItems]);

  // For dnd-kit: only song item IDs (separators are not draggable)
  const sortableIds = useMemo(() =>
    displayItems.filter(e => e.type === 'song').map(e => (e as { type: 'song'; item: SessionItem }).item.id),
    [displayItems]
  );

  const nextUpItem = currentItemId ? usePlayerStore.getState().getNextItem() : null;

  // Calculate total playlist time
  const { totalDuration, totalRemaining } = useMemo(() => {
    let total = 0;
    let remaining = 0;
    let foundCurrent = false;
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

      if (i === currentIdx) {
        foundCurrent = true;
        const currentRemaining = Math.max(0, adjustedDuration - (currentTime - start) / (speed > 0 ? speed : 1));
        remaining += currentRemaining;
      } else if (foundCurrent && !playedSongIds.has(item.song_id)) {
        remaining += adjustedDuration;
      }
    }

    return { totalDuration: total, totalRemaining: remaining };
  }, [filteredItems, currentItemId, currentTime, playedSongIds]);

  const getPassword = () => {
    if (!sessionId) return undefined;
    return useSessionStore.getState().getPassword(sessionId);
  };

  const refreshSession = async () => {
    if (!sessionId) return;
    await useSessionStore.getState().fetchActiveSession(sessionId);
    usePlayerStore.getState().syncFromSessionStore();
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

  const handleAssignFolder = async (itemId: number, folderId: number | null) => {
    if (!sessionId) return;
    try {
      await api.assignItemFolder(sessionId, itemId, folderId, getPassword());
      await refreshSession();
    } catch { /* ignore */ }
  };

  const handleCreateTag = async () => {
    if (!sessionId || !newTagName.trim()) return;
    try {
      await api.createSessionFolder(sessionId, { name: newTagName.trim(), color: newTagColor }, getPassword());
      await refreshSession();
      setNewTagName('');
      setNewTagColor(TAG_COLORS[(folders.length + 1) % TAG_COLORS.length]);
      setCreatingTag(false);
    } catch { /* ignore */ }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!sessionId || search) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Work with the filtered items (songs only, no separators)
    const songItems = displayItems.filter(e => e.type === 'song').map(e => (e as { type: 'song'; item: SessionItem }).item);
    const oldIndex = songItems.findIndex(i => i.id === active.id);
    const newIndex = songItems.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(songItems, oldIndex, newIndex);
    const itemIds = reordered.map(i => i.id);

    try {
      if (activeTagId !== null) {
        await api.reorderFolderItems(sessionId, activeTagId, itemIds, getPassword());
      } else {
        await api.reorderSessionItems(sessionId, itemIds, getPassword());
      }
      await refreshSession();
    } catch { /* ignore */ }
  };

  const playedCount = filteredItems.filter(i => playedSongIds.has(i.song_id)).length;

  // Build a song index lookup from filteredItems for display numbering
  const songIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    filteredItems.forEach((item, idx) => map.set(item.id, idx));
    return map;
  }, [filteredItems]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Tag chips */}
      <div className="px-4 py-2 border-b border-border overflow-x-auto flex-shrink-0">
        <div className="flex gap-1.5 flex-nowrap items-center">
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
          {/* Create tag button — only in editable mode */}
          {!restrictedMode && !creatingTag && (
            <button
              onClick={() => {
                setNewTagColor(TAG_COLORS[folders.length % TAG_COLORS.length]);
                setCreatingTag(true);
              }}
              className="px-2 py-1.5 rounded-full text-xs text-text-muted hover:text-accent hover:bg-accent/10 transition-colors min-h-[36px] flex items-center gap-1 whitespace-nowrap"
              title="Nueva etiqueta"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
        {/* Inline tag creation */}
        {!restrictedMode && creatingTag && (
          <div className="flex items-center gap-2 mt-2">
            <input
              ref={tagInputRef}
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateTag(); if (e.key === 'Escape') setCreatingTag(false); }}
              placeholder="Nombre..."
              className="flex-1 text-xs px-2 py-1.5 rounded-md bg-bg-primary border border-border/60 text-text-primary focus:outline-none focus:border-accent/60 placeholder:text-text-muted/50 min-w-0"
            />
            <div className="flex gap-1">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  className="w-5 h-5 rounded-full transition-transform duration-100 flex-shrink-0"
                  style={{
                    backgroundColor: c,
                    boxShadow: newTagColor === c ? `0 0 0 2px ${c}40, 0 0 0 3px ${c}` : 'none',
                    transform: newTagColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            <button onClick={handleCreateTag} className="text-xs px-2 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors whitespace-nowrap">
              Crear
            </button>
            <button onClick={() => setCreatingTag(false)} className="text-xs px-1.5 py-1 rounded text-text-muted hover:text-text-primary transition-colors">
              &times;
            </button>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="px-4 py-2 border-b border-border flex-shrink-0">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cancion..."
            className="w-full bg-bg-primary border border-border/60 rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60 placeholder:text-text-muted/50 transition-colors"
          />
        </div>
      </div>

      {/* Playlist time info */}
      <div className="px-4 py-1.5 border-b border-border flex items-center gap-3 text-xs text-text-muted font-mono flex-shrink-0 flex-wrap">
        <span title="Duración total">Total: {formatDuration(totalDuration)}</span>
        {currentItemId && (
          <span title="Tiempo restante">Restante: {formatDuration(totalRemaining)}</span>
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
      <div className="flex-1 overflow-y-auto" id="player-playlist-scroll">
        {displayItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-text-muted text-sm">
            {search ? 'Sin resultados' : 'No hay canciones en esta vista'}
          </div>
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className="py-1">
                {displayItems.map((entry) => {
                  if (entry.type === 'separator') {
                    return (
                      <div
                        key={`sep-${entry.id}`}
                        className="flex items-center gap-2 px-3 py-1.5"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.06) 20%, rgba(34,211,238,0.06) 80%, transparent)' }}
                      >
                        <div className="flex-1 flex items-center gap-3">
                          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider whitespace-nowrap drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]">
                            {entry.text}
                          </span>
                          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
                        </div>
                      </div>
                    );
                  }
                  const item = entry.item;
                  const isPlayed = playedSongIds.has(item.song_id);
                  const isCurrent = item.id === currentItemId;
                  const isNext = nextUpItem?.id === item.id && !isCurrent;
                  const songIndex = songIndexMap.get(item.id) ?? 0;
                  return (
                    <SortableSongRow
                      key={item.id}
                      item={item}
                      isPlayed={isPlayed}
                      isCurrent={isCurrent}
                      isNext={isNext}
                      songIndex={songIndex}
                      folders={folders}
                      restrictedMode={restrictedMode}
                      onPlay={handlePlayItem}
                      onAddToQueue={handleAddToQueue}
                      onAssignFolder={handleAssignFolder}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

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
