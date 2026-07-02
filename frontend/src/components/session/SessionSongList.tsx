import { useState, useMemo, useRef, useEffect } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SessionItem, SessionFolder, DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';

interface SessionSongListProps {
  items: SessionItem[];
  sessionId: number;
  password?: string;
  onUpdate: () => void;
  folders: SessionFolder[];
  activeFolder: number | null;
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

  const currentFolder = currentFolderId ? folders.find(f => f.id === currentFolderId) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(!open); }}
        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
          currentFolder
            ? 'hover:brightness-125'
            : 'bg-bg-tertiary text-text-muted hover:text-text-primary'
        }`}
        style={currentFolder ? { backgroundColor: `${currentFolder.color}25`, color: currentFolder.color } : undefined}
        title="Asignar etiqueta"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
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
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
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
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
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

function SeparatorBanner({ text, onEdit, onRemove }: { text: string; onEdit: (text: string) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleSubmit = () => {
    const trimmed = editText.trim();
    if (trimmed) {
      onEdit(trimmed);
    } else {
      onRemove();
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/5 border-b border-cyan-400/20">
        <div className="flex-1 flex items-center gap-2">
          <span className="text-cyan-400 text-xs">---</span>
          <input
            ref={inputRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setEditing(false); }}
            onBlur={handleSubmit}
            className="flex-1 bg-bg-primary border border-cyan-400/40 rounded px-2 py-1 text-xs text-cyan-300 font-bold focus:outline-none focus:border-cyan-400/80 placeholder:text-cyan-400/30"
            placeholder="Texto del separador..."
          />
          <span className="text-cyan-400 text-xs">---</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b border-cyan-400/20 group/sep cursor-pointer"
      style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.06) 20%, rgba(34,211,238,0.06) 80%, transparent)' }}
      onClick={e => { e.stopPropagation(); setEditing(true); }}
    >
      <div className="flex-1 flex items-center gap-3">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
        <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider whitespace-nowrap drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]">
          {text}
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      </div>
      <button
        onClick={e => { e.stopPropagation(); onRemove(); }}
        className="text-[10px] px-1 py-0.5 rounded text-danger/50 hover:text-danger hover:bg-danger/10 opacity-0 group-hover/sep:opacity-100 transition-all"
        title="Eliminar separador"
      >
        &times;
      </button>
    </div>
  );
}

function SortableItem({ item, sessionId, password, onUpdate, isNext, folders, activeFolder, isSelected, onToggleSelect, onShowDeckPicker, onMoveUp, onMoveDown, isFirst, isLast }: {
  item: SessionItem;
  sessionId: number;
  password?: string;
  onUpdate: () => void;
  isNext: boolean;
  folders: SessionFolder[];
  activeFolder: number | null;
  isSelected: boolean;
  onToggleSelect: (itemId: number) => void;
  onShowDeckPicker: (item: SessionItem) => void;
  onMoveUp: (itemId: number) => void;
  onMoveDown: (itemId: number) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const setSeparator = async (text: string | null) => {
    await api.updateSessionItem(sessionId, item.id, { separator_text: text ?? '' }, password);
    onUpdate();
  };

  const markPlayed = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await api.updateSessionItem(sessionId, item.id, { is_played: !item.is_played }, password);
    onUpdate();
  };

  const removeItem = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await api.removeSessionItem(sessionId, item.id, password);
    onUpdate();
  };

  const assignFolder = async (folderId: number | null) => {
    await api.assignItemFolder(sessionId, item.id, folderId, password);
    onUpdate();
  };

  const itemFolder = item.folder_id ? folders.find(f => f.id === item.folder_id) : null;
  const displayPos = activeFolder ? (item.folder_position ?? 0) + 1 : item.position + 1;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Separator banner above this song */}
      {item.separator_text && (
        <SeparatorBanner
          text={item.separator_text}
          onEdit={text => setSeparator(text)}
          onRemove={() => setSeparator(null)}
        />
      )}
    <div
      onClick={() => onShowDeckPicker(item)}
      className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/30 group/row transition-colors cursor-pointer relative ${
        isSelected ? 'bg-accent/15 border-l-2 border-l-accent' :
        item.is_played ? 'opacity-40' : isNext ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-bg-hover'
      }`}
    >
      {/* Selection checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggleSelect(item.id); }}
        className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          isSelected ? 'bg-accent border-accent' : 'border-border hover:border-text-muted'
        }`}
      >
        {isSelected && (
          <svg width="8" height="8" viewBox="0 0 16 16" fill="white">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
          </svg>
        )}
      </button>

      {/* Up/Down arrows */}
      <div className="flex flex-col gap-0 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onMoveUp(item.id); }}
          disabled={isFirst}
          className="text-text-muted hover:text-text-primary disabled:opacity-20 disabled:cursor-default transition-colors p-0 leading-none"
          title="Mover arriba"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onMoveDown(item.id); }}
          disabled={isLast}
          className="text-text-muted hover:text-text-primary disabled:opacity-20 disabled:cursor-default transition-colors p-0 leading-none"
          title="Mover abajo"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab text-text-muted hover:text-text-primary text-xs" onClick={e => e.stopPropagation()}>
        :::
      </div>
      <span className="text-xs text-text-muted w-5 text-center tabular-nums">{displayPos}</span>
      {/* Tag color indicator in "Todas" view */}
      {activeFolder === null && itemFolder && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-offset-1 ring-offset-bg-primary"
          style={{ backgroundColor: itemFolder.color, boxShadow: `0 0 4px ${itemFolder.color}40` }}
          title={itemFolder.name}
        />
      )}
      <div className="flex-1 min-w-0">
        <span className={`text-sm text-text-primary truncate block leading-tight ${item.is_played ? 'line-through' : ''}`}>{item.song.title}</span>
        <span className="text-xs text-text-muted truncate block leading-tight">{item.song.artist}</span>
      </div>
      <span className="text-xs text-text-muted font-mono tabular-nums hidden sm:inline">{formatDuration(item.song.duration_seconds)}</span>
      <div className="flex gap-1 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
        {folders.length > 0 && (
          <FolderDropdown folders={folders} currentFolderId={item.folder_id} onAssign={assignFolder} />
        )}
        <button
          onClick={e => { e.stopPropagation(); setSeparator(item.separator_text ? null : 'Separador'); }}
          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${item.separator_text ? 'bg-cyan-400/20 text-cyan-400' : 'bg-bg-tertiary text-text-muted hover:text-cyan-400'}`}
          title={item.separator_text ? 'Quitar separador' : 'Agregar separador arriba'}
        >
          ―
        </button>
        <button onClick={markPlayed} className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${item.is_played ? 'bg-success/20 text-success' : 'bg-bg-tertiary text-text-muted hover:text-success'}`}>
          {item.is_played ? (
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
          ) : '\u25CB'}
        </button>
        <button onClick={removeItem} className="text-[10px] px-1.5 py-0.5 rounded bg-danger/20 text-danger hover:bg-danger/30 transition-colors">&times;</button>
      </div>
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
}: SessionSongListProps) {
  const [search, setSearch] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [deckPickerItem, setDeckPickerItem] = useState<SessionItem | null>(null);

  const loadSong = useDeckStore(s => s.loadSong);
  const setDuration = useDeckStore(s => s.setDuration);
  const engine = getAudioEngine();

  const loadToDeck = async (item: SessionItem, deckId: DeckId) => {
    loadSong(deckId, item.song);
    const duration = await engine.loadSong(deckId, item.song.id, item.song.stems_status === 'ready');
    setDuration(deckId, duration);
    // Auto-mark as played
    if (!item.is_played) {
      await api.updateSessionItem(sessionId, item.id, { is_played: true }, password);
      onUpdate();
    }
    setDeckPickerItem(null);
  };

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
  const hasSelection = selectedItemIds.size > 0;

  const toggleSelect = (itemId: number) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleMoveToTop = async () => {
    if (!hasSelection) return;
    const selected = visibleItems.filter(i => selectedItemIds.has(i.id));
    const unselected = visibleItems.filter(i => !selectedItemIds.has(i.id));
    const reordered = [...selected, ...unselected];
    const itemIds = reordered.map(i => i.id);

    if (activeFolder !== null) {
      await api.reorderFolderItems(sessionId, activeFolder, itemIds, password);
    } else {
      await api.reorderSessionItems(sessionId, itemIds, password);
    }
    setSelectedItemIds(new Set());
    onUpdate();
  };

  const handleMoveToBottom = async () => {
    if (!hasSelection) return;
    const selected = visibleItems.filter(i => selectedItemIds.has(i.id));
    const unselected = visibleItems.filter(i => !selectedItemIds.has(i.id));
    const reordered = [...unselected, ...selected];
    const itemIds = reordered.map(i => i.id);

    if (activeFolder !== null) {
      await api.reorderFolderItems(sessionId, activeFolder, itemIds, password);
    } else {
      await api.reorderSessionItems(sessionId, itemIds, password);
    }
    setSelectedItemIds(new Set());
    onUpdate();
  };

  const handleMoveUp = async (itemId: number) => {
    const idx = visibleItems.findIndex(i => i.id === itemId);
    if (idx <= 0) return;
    const reordered = arrayMove(visibleItems, idx, idx - 1);
    const itemIds = reordered.map(i => i.id);
    if (activeFolder !== null) {
      await api.reorderFolderItems(sessionId, activeFolder, itemIds, password);
    } else {
      await api.reorderSessionItems(sessionId, itemIds, password);
    }
    onUpdate();
  };

  const handleMoveDown = async (itemId: number) => {
    const idx = visibleItems.findIndex(i => i.id === itemId);
    if (idx < 0 || idx >= visibleItems.length - 1) return;
    const reordered = arrayMove(visibleItems, idx, idx + 1);
    const itemIds = reordered.map(i => i.id);
    if (activeFolder !== null) {
      await api.reorderFolderItems(sessionId, activeFolder, itemIds, password);
    } else {
      await api.reorderSessionItems(sessionId, itemIds, password);
    }
    onUpdate();
  };

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
  const activeFolderData = activeFolder !== null ? folders.find(f => f.id === activeFolder) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border/30">
        <div className="relative">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeFolder !== null && activeFolderData ? `Buscar en ${activeFolderData.name}...` : 'Buscar en sesión...'}
            className="w-full bg-bg-primary border border-border/60 rounded-md pl-8 pr-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/60 placeholder:text-text-muted/50 transition-colors"
          />
        </div>
      </div>

      {/* Floating action bar for selection */}
      {hasSelection && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/10 border-b border-accent/30">
          <span className="text-xs text-accent font-medium">{selectedItemIds.size} seleccionados</span>
          <div className="flex-1" />
          <button
            onClick={handleMoveToTop}
            className="text-[10px] px-2 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-medium"
          >
            Mover arriba
          </button>
          <button
            onClick={handleMoveToBottom}
            className="text-[10px] px-2 py-1 rounded bg-accent/20 text-accent hover:bg-accent/30 transition-colors font-medium"
          >
            Mover abajo
          </button>
          <button
            onClick={() => setSelectedItemIds(new Set())}
            className="text-[10px] px-2 py-1 rounded bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
          >
            Limpiar
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {filtered.map((item, idx) => (
              <SortableItem
                key={item.id}
                item={item}
                sessionId={sessionId}
                password={password}
                onUpdate={onUpdate}
                isNext={item.id === firstUnplayed?.id}
                folders={folders}
                activeFolder={activeFolder}
                isSelected={selectedItemIds.has(item.id)}
                onToggleSelect={toggleSelect}
                onShowDeckPicker={setDeckPickerItem}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                isFirst={idx === 0}
                isLast={idx === filtered.length - 1}
              />
            ))}
          </SortableContext>
        </DndContext>
        {filtered.length === 0 && visibleItems.length > 0 && (
          <div className="py-6 text-center text-text-muted text-xs">Sin resultados</div>
        )}
        {visibleItems.length === 0 && activeFolder !== null && (
          <div className="py-10 text-center">
            <svg width="32" height="32" viewBox="0 0 16 16" fill="none" className="mx-auto mb-2 text-text-muted/30">
              <path d="M2 3.5A1.5 1.5 0 013.5 2h2.879a1.5 1.5 0 011.06.44l.622.621a1.5 1.5 0 001.06.439H12.5A1.5 1.5 0 0114 5v7.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 12.5v-9z" stroke="currentColor" strokeWidth="1"/>
            </svg>
            <p className="text-text-muted text-sm">Etiqueta vacía</p>
            <p className="text-text-muted/60 text-xs mt-1">Asigna canciones desde la vista Todas</p>
          </div>
        )}
        {items.length === 0 && (
          <div className="py-8 text-center text-text-muted text-sm">
            No hay canciones aún. Haz clic en "Add Song" para empezar.
          </div>
        )}
      </div>

      {/* Deck picker overlay */}
      {deckPickerItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeckPickerItem(null)}
        >
          <div
            className="bg-bg-secondary border border-border rounded-xl p-6 mx-4 max-w-sm w-full shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-5">
              <p className="text-text-muted text-xs uppercase tracking-wider mb-2">Reproducir en</p>
              <p className="text-text-primary font-semibold truncate">{deckPickerItem.song.title}</p>
              <p className="text-text-muted text-sm truncate">{deckPickerItem.song.artist}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => loadToDeck(deckPickerItem, 'A')}
                className="flex-1 py-3 rounded-lg text-sm font-bold bg-deck-a/20 text-deck-a border border-deck-a/30 hover:bg-deck-a/30 active:bg-deck-a/40 transition-colors"
              >
                Deck A
              </button>
              <button
                onClick={() => loadToDeck(deckPickerItem, 'B')}
                className="flex-1 py-3 rounded-lg text-sm font-bold bg-deck-b/20 text-deck-b border border-deck-b/30 hover:bg-deck-b/30 active:bg-deck-b/40 transition-colors"
              >
                Deck B
              </button>
            </div>
            <button
              onClick={() => setDeckPickerItem(null)}
              className="w-full mt-3 py-2 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
