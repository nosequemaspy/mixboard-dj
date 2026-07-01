import { useState, useEffect, useRef } from 'react';
import type { Song, DeckId } from '../../types';
import { useLibraryStore } from '../../store/libraryStore';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';

export function SongTable() {
  const { songs, categories, sortBy, sortDir, setSort, fetchSongs, fetchCategories } = useLibraryStore();
  const loadSong = useDeckStore(s => s.loadSong);
  const setDuration = useDeckStore(s => s.setDuration);
  const engine = getAudioEngine();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song } | null>(null);

  // Tag picker state
  const [tagPickerSongId, setTagPickerSongId] = useState<number | null>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);

  // Inline artist editing state
  const [editingSongId, setEditingSongId] = useState<number | null>(null);
  const [editArtist, setEditArtist] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // Close tag picker on click outside
  useEffect(() => {
    if (tagPickerSongId === null) return;
    const handler = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setTagPickerSongId(null);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [tagPickerSongId]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingSongId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSongId]);

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

  const handleDownload = async (song: Song) => {
    setContextMenu(null);
    try {
      const res = await fetch(api.downloadUrl(song.id));
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${song.artist} - ${song.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleSeparateStems = async (song: Song) => {
    await api.separateStems(song.id);
    setContextMenu(null);
    fetchSongs();
  };

  const handleToggleTag = async (songId: number, categoryId: number, currentCategoryIds: number[]) => {
    const newIds = currentCategoryIds.includes(categoryId)
      ? currentCategoryIds.filter(id => id !== categoryId)
      : [...currentCategoryIds, categoryId];
    await api.updateSong(songId, { category_ids: newIds });
    fetchSongs();
  };

  const handleArtistSave = async (songId: number) => {
    if (editArtist.trim()) {
      await api.updateSong(songId, { artist: editArtist.trim() });
      fetchSongs();
    }
    setEditingSongId(null);
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
    <div className="flex-1 overflow-y-auto relative" onClick={() => { setContextMenu(null); setTagPickerSongId(null); }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-bg-secondary z-10">
          <tr className="text-left text-text-muted text-xs border-b border-border">
            <th className="py-2 px-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('title')}>
              Title{sortIcon('title')}
            </th>
            <th className="py-2 px-3 cursor-pointer hover:text-text-primary" onClick={() => handleSort('artist')}>
              Artist{sortIcon('artist')}
            </th>
            <th className="py-2 px-2 w-16 cursor-pointer hover:text-text-primary hidden md:table-cell" onClick={() => handleSort('bpm')}>
              BPM{sortIcon('bpm')}
            </th>
            <th className="py-2 px-2 w-12 hidden md:table-cell">Key</th>
            <th className="py-2 px-2 w-16 cursor-pointer hover:text-text-primary" onClick={() => handleSort('duration_seconds')}>
              Time{sortIcon('duration_seconds')}
            </th>
            <th className="py-2 px-2 w-20 hidden md:table-cell">Stems</th>
            <th className="py-2 px-2 w-20 hidden md:table-cell">Tags</th>
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
              <td
                className="py-1.5 px-3 text-text-secondary truncate max-w-[150px]"
                onDoubleClick={() => {
                  setEditingSongId(song.id);
                  setEditArtist(song.artist);
                }}
              >
                {editingSongId === song.id ? (
                  <input
                    ref={editInputRef}
                    value={editArtist}
                    onChange={e => setEditArtist(e.target.value)}
                    onBlur={() => handleArtistSave(song.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleArtistSave(song.id);
                      if (e.key === 'Escape') setEditingSongId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    className="bg-bg-primary border border-accent/60 rounded px-1 py-0 text-sm text-text-primary w-full focus:outline-none"
                  />
                ) : (
                  song.artist
                )}
              </td>
              <td className="py-1.5 px-2 text-text-muted hidden md:table-cell">{song.bpm ? Math.round(song.bpm) : '-'}</td>
              <td className="py-1.5 px-2 text-text-muted hidden md:table-cell">{song.key || '-'}</td>
              <td className="py-1.5 px-2 text-text-muted font-mono text-xs">{formatDuration(song.duration_seconds)}</td>
              <td className="py-1.5 px-2 hidden md:table-cell">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  song.stems_status === 'ready' ? 'bg-success/20 text-success' :
                  song.stems_status === 'processing' ? 'bg-warning/20 text-warning' :
                  'bg-bg-tertiary text-text-muted'
                }`}>
                  {song.stems_status === 'ready' ? 'Ready' :
                   song.stems_status === 'processing' ? 'Processing' : 'None'}
                </span>
              </td>
              <td className="py-1.5 px-2 relative hidden md:table-cell">
                <div
                  className="flex gap-0.5 flex-wrap cursor-pointer min-h-[20px] rounded hover:bg-bg-tertiary/50 px-0.5 py-0.5 transition-colors"
                  onClick={e => {
                    e.stopPropagation();
                    setTagPickerSongId(tagPickerSongId === song.id ? null : song.id);
                  }}
                >
                  {song.categories.length > 0 ? (
                    song.categories.map(cat => (
                      <span
                        key={cat.id}
                        className="text-[9px] px-1 py-0.5 rounded-full"
                        style={{ backgroundColor: cat.color + '30', color: cat.color }}
                      >
                        {cat.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[9px] text-text-muted/40">+</span>
                  )}
                </div>

                {/* Tag picker dropdown */}
                {tagPickerSongId === song.id && (
                  <div
                    ref={tagPickerRef}
                    className="absolute right-0 top-full mt-1 z-50 bg-bg-secondary/95 backdrop-blur-sm border border-border/60 rounded-lg shadow-xl py-1 min-w-[160px]"
                    onClick={e => e.stopPropagation()}
                  >
                    {categories.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-text-muted">No categories</div>
                    ) : (
                      categories.map(cat => {
                        const isChecked = song.categories.some(c => c.id === cat.id);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => handleToggleTag(song.id, cat.id, song.categories.map(c => c.id))}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover flex items-center gap-2 transition-colors"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="flex-1 text-text-primary">{cat.name}</span>
                            {isChecked && (
                              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-accent shrink-0">
                                <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                              </svg>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
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
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-hover"
            onClick={() => handleDownload(contextMenu.song)}
          >
            Descargar a PC
          </button>
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
