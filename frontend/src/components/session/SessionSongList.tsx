import { useState, useMemo, useRef, useEffect } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SessionItem, SessionFolder, DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';
import { FolderChips } from './FolderChips';

interface SessionSongListProps {
  items: SessionItem[];
  sessionId: number;
  password?: string;
  onUpdate: () => void;
  folders: SessionFolder[];
  activeFolder: number | null;
  onFolderChange: (folderId: number | null) => void;
  onCreateFolder: (name: string, color: string) => void;
  onDeleteFolder: (folderId: number) => void;
  onRenameFolder: (folderId: number, name: string, color: string) => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className="text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted hover:text-text-primary"
        title="Assign to folder"
      >
        &#128193;
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 bg-bg-secondary border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
          <button
            onClick={() => { onAssign(null); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover ${currentFolderId === null ? 'text-accent font-medium' : 'text-text-primary'}`}
          >
            Home only
          </button>
          {folders.map(f => (
            <button
              key={f.id}
              onClick={() => { onAssign(f.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover flex items-center gap-2 ${currentFolderId === f.id ? 'text-accent font-medium' : 'text-text-primary'}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SortableItem({ item, sessionId, password, onUpdate, isNext, folders, activeFolder }: {
  item: SessionItem;
  sessionId: number;
  password?: string;
  onUpdate: () => void;
  isNext: boolean;
  folders: SessionFolder[];
  activeFolder: number | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const loadSong = useDeckStore(s => s.loadSong);
  const setDuration = useDeckStore(s => s.setDuration);
  const engine = getAudioEngine();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const loadToDeck = async (deckId: DeckId) => {
    loadSong(deckId, item.song);
    const duration = await engine.loadSong(deckId, item.song.id, item.song.stems_status === 'ready');
    setDuration(deckId, duration);
  };

  const markPlayed = async () => {
    await api.updateSessionItem(sessionId, item.id, { is_played: !item.is_played }, password);
    onUpdate();
  };

  const removeItem = async () => {
    await api.removeSessionItem(sessionId, item.id, password);
    onUpdate();
  };

  const assignFolder = async (folderId: number | null) => {
    await api.assignItemFolder(sessionId, item.id, folderId, password);
    onUpdate();
  };

  const folderColor = item.folder_id ? folders.find(f => f.id === item.folder_id)?.color : null;
  const displayPos = activeFolder ? (item.folder_position ?? 0) + 1 : item.position + 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/30 group transition-colors ${
        item.is_played ? 'opacity-40' : isNext ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-bg-hover'
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-text-muted hover:text-text-primary text-xs">
        :::
      </div>
      <span className="text-xs text-text-muted w-5">{displayPos}</span>
      {/* Folder color dot in Home view */}
      {activeFolder === null && folderColor && (
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: folderColor }} />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-text-primary truncate block">{item.song.title}</span>
        <span className="text-xs text-text-muted truncate block">{item.song.artist}</span>
      </div>
      <span className="text-xs text-text-muted font-mono">{formatDuration(item.song.duration_seconds)}</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {folders.length > 0 && (
          <FolderDropdown folders={folders} currentFolderId={item.folder_id} onAssign={assignFolder} />
        )}
        <button onClick={() => loadToDeck('A')} className="text-[10px] px-1.5 py-0.5 rounded bg-deck-a/20 text-deck-a hover:bg-deck-a/30">A</button>
        <button onClick={() => loadToDeck('B')} className="text-[10px] px-1.5 py-0.5 rounded bg-deck-b/20 text-deck-b hover:bg-deck-b/30">B</button>
        <button onClick={markPlayed} className={`text-[10px] px-1.5 py-0.5 rounded ${item.is_played ? 'bg-success/20 text-success' : 'bg-bg-tertiary text-text-muted hover:text-success'}`}>
          {item.is_played ? '\u2713' : '\u25CB'}
        </button>
        <button onClick={removeItem} className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger hover:bg-danger/30">&times;</button>
      </div>
    </div>
  );
}

export function SessionSongList({
  items,
  sessionId,
  password,
  onUpdate,
  folders,
  activeFolder,
  onFolderChange,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
}: SessionSongListProps) {
  const [search, setSearch] = useState('');

  const folderItemCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of items) {
      if (item.folder_id) {
        counts[item.folder_id] = (counts[item.folder_id] || 0) + 1;
      }
    }
    return counts;
  }, [items]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (activeFolder !== null) {
      list = items.filter(i => i.folder_id === activeFolder);
      list = [...list].sort((a, b) => (a.folder_position ?? 0) - (b.folder_position ?? 0));
    } else {
      list = [...list].sort((a, b) => a.position - b.position);
    }
    return list;
  }, [items, activeFolder]);

  const filtered = visibleItems.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.song.title.toLowerCase().includes(q) || item.song.artist.toLowerCase().includes(q);
  });

  const isFiltering = search.length > 0;

  const handleDragEnd = async (event: DragEndEvent) => {
    if (isFiltering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = visibleItems.findIndex(i => i.id === active.id);
    const newIndex = visibleItems.findIndex(i => i.id === over.id);
    const reordered = arrayMove(visibleItems, oldIndex, newIndex);
    const itemIds = reordered.map(i => i.id);

    if (activeFolder !== null) {
      await api.reorderFolderItems(sessionId, activeFolder, itemIds, password);
    } else {
      await api.reorderSessionItems(sessionId, itemIds, password);
    }
    onUpdate();
  };

  const firstUnplayed = filtered.find(i => !i.is_played);

  return (
    <div className="flex flex-col h-full">
      <FolderChips
        folders={folders}
        activeFolder={activeFolder}
        onFolderChange={onFolderChange}
        totalItems={items.length}
        folderItemCounts={folderItemCounts}
        onCreate={onCreateFolder}
        onDelete={onDeleteFolder}
        onRename={onRenameFolder}
      />
      <div className="px-3 py-2 border-b border-border/30">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search in session..."
          className="w-full bg-bg-primary border border-border rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {filtered.map(item => (
              <SortableItem
                key={item.id}
                item={item}
                sessionId={sessionId}
                password={password}
                onUpdate={onUpdate}
                isNext={item.id === firstUnplayed?.id}
                folders={folders}
                activeFolder={activeFolder}
              />
            ))}
          </SortableContext>
        </DndContext>
        {filtered.length === 0 && visibleItems.length > 0 && (
          <div className="py-4 text-center text-text-muted text-xs">No matches</div>
        )}
        {visibleItems.length === 0 && activeFolder !== null && (
          <div className="py-8 text-center text-text-muted text-sm">
            No songs in this folder. Assign songs from Home view.
          </div>
        )}
        {items.length === 0 && (
          <div className="py-8 text-center text-text-muted text-sm">
            No songs yet. Click "Add Song" to start.
          </div>
        )}
      </div>
    </div>
  );
}
