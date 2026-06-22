import { useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SessionItem, DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';

interface SessionSongListProps {
  items: SessionItem[];
  sessionId: number;
  password?: string;
  onUpdate: () => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function SortableItem({ item, sessionId, password, onUpdate, isNext }: {
  item: SessionItem;
  sessionId: number;
  password?: string;
  onUpdate: () => void;
  isNext: boolean;
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
      <span className="text-xs text-text-muted w-5">{item.position + 1}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-text-primary truncate block">{item.song.title}</span>
        <span className="text-xs text-text-muted truncate block">{item.song.artist}</span>
      </div>
      <span className="text-xs text-text-muted font-mono">{formatDuration(item.song.duration_seconds)}</span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

export function SessionSongList({ items, sessionId, password, onUpdate }: SessionSongListProps) {
  const [search, setSearch] = useState('');

  const filtered = items.filter(item => {
    if (!search) return true;
    const q = search.toLowerCase();
    return item.song.title.toLowerCase().includes(q) || item.song.artist.toLowerCase().includes(q);
  });

  const isFiltering = search.length > 0;

  const handleDragEnd = async (event: DragEndEvent) => {
    if (isFiltering) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex(i => i.id === active.id);
    const newIndex = items.findIndex(i => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex);
    const itemIds = reordered.map(i => i.id);
    await api.reorderSessionItems(sessionId, itemIds, password);
    onUpdate();
  };

  const firstUnplayed = filtered.find(i => !i.is_played);

  return (
    <div className="flex flex-col h-full">
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
              />
            ))}
          </SortableContext>
        </DndContext>
        {filtered.length === 0 && items.length > 0 && (
          <div className="py-4 text-center text-text-muted text-xs">No matches</div>
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
