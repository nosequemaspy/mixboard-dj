import { useState } from 'react';
import type { Song, DeckId } from '../../types';
import { useLibraryStore } from '../../store/libraryStore';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';

export function SongTable() {
  const { songs, sortBy, sortDir, setSort, fetchSongs } = useLibraryStore();
  const loadSong = useDeckStore(s => s.loadSong);
  const setDuration = useDeckStore(s => s.setDuration);
  const engine = getAudioEngine();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song } | null>(null);

  const handleSort = (field: string) => {
    const newDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc';
    setSort(field, newDir);
    fetchSongs();
  };

  const handleDragStart = (e: React.DragEvent, song: Song) => {
    e.dataTransfer.setData('application/json', JSON.stringify(song));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const loadToDeck = async (song: Song, deckId: DeckId) => {
    loadSong(deckId, song);
    const duration = await engine.loadSong(deckId, song.id, song.stems_status === 'ready');
    setDuration(deckId, duration);
    setContextMenu(null);
  };

  const handleDelete = async (song: Song) => {
    await api.deleteSong(song.id);
    fetchSongs();
    setContextMenu(null);
  };

  const handleSeparateStems = async (song: Song) => {
    await api.separateStems(song.id);
    setContextMenu(null);
    fetchSongs();
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const sortIcon = (field: string) => {
    if (sortBy !== field) return '';
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
  };

  return (
    <div className="flex-1 overflow-y-auto relative" onClick={() => setContextMenu(null)}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-secondary z-10">
          <tr className="text-left text-text-muted text-xs border-b border-border">
            <th className="py-2 px-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('title')}>
              Title{sortIcon('title')}
            </th>
            <th className="py-2 px-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('artist')}>
              Artist{sortIcon('artist')}
            </th>
            <th className="py-2 px-2 w-16 cursor-pointer hover:text-text-primary" onClick={() => handleSort('bpm')}>
              BPM{sortIcon('bpm')}
            </th>
            <th className="py-2 px-2 w-12">Key</th>
            <th className="py-2 px-2 w-16 cursor-pointer hover:text-text-primary" onClick={() => handleSort('duration_seconds')}>
              Time{sortIcon('duration_seconds')}
            </th>
            <th className="py-2 px-2 w-20">Stems</th>
            <th className="py-2 px-2 w-20">Tags</th>
          </tr>
        </thead>
        <tbody>
          {songs.map(song => (
            <tr
              key={song.id}
              draggable
              onDragStart={e => handleDragStart(e, song)}
              onContextMenu={e => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, song });
              }}
              className="border-b border-border/30 hover:bg-bg-hover cursor-grab active:cursor-grabbing transition-colors"
            >
              <td className="py-1.5 px-3 text-text-primary truncate max-w-[200px]">{song.title}</td>
              <td className="py-1.5 px-3 text-text-secondary truncate max-w-[150px]">{song.artist}</td>
              <td className="py-1.5 px-2 text-text-muted">{song.bpm ? Math.round(song.bpm) : '-'}</td>
              <td className="py-1.5 px-2 text-text-muted">{song.key || '-'}</td>
              <td className="py-1.5 px-2 text-text-muted font-mono text-xs">{formatDuration(song.duration_seconds)}</td>
              <td className="py-1.5 px-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  song.stems_status === 'ready' ? 'bg-success/20 text-success' :
                  song.stems_status === 'processing' ? 'bg-warning/20 text-warning' :
                  'bg-bg-tertiary text-text-muted'
                }`}>
                  {song.stems_status === 'ready' ? 'Ready' :
                   song.stems_status === 'processing' ? 'Processing' : 'None'}
                </span>
              </td>
              <td className="py-1.5 px-2">
                <div className="flex gap-0.5 flex-wrap">
                  {song.categories.map(cat => (
                    <span
                      key={cat.id}
                      className="text-[9px] px-1 py-0.5 rounded-full"
                      style={{ backgroundColor: cat.color + '30', color: cat.color }}
                    >
                      {cat.name}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {songs.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-text-muted text-sm">
                No songs found. Import or download some music to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-bg-tertiary border border-border rounded-lg shadow-xl py-1 z-50 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-deck-a hover:bg-bg-hover"
            onClick={() => loadToDeck(contextMenu.song, 'A')}
          >
            Load to Deck A
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-deck-b hover:bg-bg-hover"
            onClick={() => loadToDeck(contextMenu.song, 'B')}
          >
            Load to Deck B
          </button>
          <hr className="border-border my-1" />
          <a
            href={api.downloadUrl(contextMenu.song.id)}
            className="block w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover"
            onClick={() => setContextMenu(null)}
          >
            Descargar a PC
          </a>
          {contextMenu.song.stems_status === 'none' && (
            <button
              className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover"
              onClick={() => handleSeparateStems(contextMenu.song)}
            >
              Separate Stems
            </button>
          )}
          <hr className="border-border my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-bg-hover"
            onClick={() => handleDelete(contextMenu.song)}
          >
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}
