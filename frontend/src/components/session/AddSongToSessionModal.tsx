import { useState, useMemo } from 'react';
import { Modal } from '../shared/Modal';
import type { Song } from '../../types';

interface AddSongToSessionModalProps {
  open: boolean;
  onClose: () => void;
  songs: Song[];
  onAdd: (songId: number) => void;
  onAddAll?: (songIds: number[]) => void;
  existingItemSongIds?: number[];
}

export function AddSongToSessionModal({ open, onClose, songs, onAdd, onAddAll, existingItemSongIds = [] }: AddSongToSessionModalProps) {
  const [search, setSearch] = useState('');
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());

  // Filter out songs already in session and already added in this session
  const availableSongs = useMemo(() => {
    const existingSet = new Set(existingItemSongIds);
    return songs.filter(s => !existingSet.has(s.id) && !addedIds.has(s.id));
  }, [songs, existingItemSongIds, addedIds]);

  const filtered = availableSongs.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
  });

  const handleAdd = (songId: number) => {
    onAdd(songId);
    setAddedIds(prev => new Set(prev).add(songId));
  };

  const handleAddAll = () => {
    if (!onAddAll) return;
    const ids = filtered.map(s => s.id);
    onAddAll(ids);
    setAddedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleClose = () => {
    setAddedIds(new Set());
    setSearch('');
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Song to Session">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search songs..."
            autoFocus
            className="flex-1 bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          {onAddAll && filtered.length > 0 && (
            <button
              onClick={handleAddAll}
              className="px-3 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-md transition-colors whitespace-nowrap"
            >
              Add All ({filtered.length})
            </button>
          )}
        </div>
        <div className="text-[10px] text-text-muted px-1">
          {filtered.length} song{filtered.length !== 1 ? 's' : ''} available
          {addedIds.size > 0 && <span className="text-success ml-2">{addedIds.size} added</span>}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {filtered.map(song => (
            <button
              key={song.id}
              onClick={() => handleAdd(song.id)}
              className="w-full text-left px-3 py-2 hover:bg-bg-hover rounded-md flex items-center gap-2 transition-colors"
            >
              <span className="text-sm text-text-primary">{song.title}</span>
              <span className="text-xs text-text-muted">{song.artist}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-4 text-center text-text-muted text-sm">
              {availableSongs.length === 0 ? 'All songs already added' : 'No songs found'}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
