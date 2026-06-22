import { useState } from 'react';
import { Modal } from '../shared/Modal';
import type { Song } from '../../types';

interface AddSongToSessionModalProps {
  open: boolean;
  onClose: () => void;
  songs: Song[];
  onAdd: (songId: number) => void;
}

export function AddSongToSessionModal({ open, onClose, songs, onAdd }: AddSongToSessionModalProps) {
  const [search, setSearch] = useState('');

  const filtered = songs.filter(s => {
    const q = search.toLowerCase();
    return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q);
  });

  return (
    <Modal open={open} onClose={onClose} title="Add Song to Session">
      <div className="flex flex-col gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search songs..."
          autoFocus
          className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        />
        <div className="max-h-[400px] overflow-y-auto">
          {filtered.map(song => (
            <button
              key={song.id}
              onClick={() => onAdd(song.id)}
              className="w-full text-left px-3 py-2 hover:bg-bg-hover rounded-md flex items-center gap-2 transition-colors"
            >
              <span className="text-sm text-text-primary">{song.title}</span>
              <span className="text-xs text-text-muted">{song.artist}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="py-4 text-center text-text-muted text-sm">No songs found</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
