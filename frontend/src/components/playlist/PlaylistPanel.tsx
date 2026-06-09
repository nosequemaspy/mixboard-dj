import { useEffect, useState } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { usePlaylistStore } from '../../store/playlistStore';
import { useLibraryStore } from '../../store/libraryStore';
import { api } from '../../api/http';
import { Button } from '../shared/Button';
import { Modal } from '../shared/Modal';
import { PlaylistItemRow } from './PlaylistItem';

export function PlaylistPanel() {
  const { playlists, activePlaylistId, fetchPlaylists, setActivePlaylist } = usePlaylistStore();
  const songs = useLibraryStore(s => s.songs);
  const [showCreate, setShowCreate] = useState(false);
  const [showAddSong, setShowAddSong] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState('');

  useEffect(() => {
    fetchPlaylists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activePlaylist = playlists.find(p => p.id === activePlaylistId);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const pl = await api.createPlaylist({
      name: newName.trim(),
      description: newDesc,
      event_date: newDate || null,
    });
    setNewName('');
    setNewDesc('');
    setNewDate('');
    setShowCreate(false);
    await fetchPlaylists();
    setActivePlaylist(pl.id);
  };

  const handleDelete = async (id: number) => {
    await api.deletePlaylist(id);
    if (activePlaylistId === id) setActivePlaylist(null);
    fetchPlaylists();
  };

  const handleAddSong = async (songId: number) => {
    if (!activePlaylistId) return;
    await api.addPlaylistItem(activePlaylistId, { song_id: songId });
    fetchPlaylists();
    setShowAddSong(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (!activePlaylist) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activePlaylist.items.findIndex(i => i.id === active.id);
    const newIndex = activePlaylist.items.findIndex(i => i.id === over.id);
    const reordered = arrayMove(activePlaylist.items, oldIndex, newIndex);
    const itemIds = reordered.map(i => i.id);
    await api.reorderPlaylistItems(activePlaylist.id, itemIds);
    fetchPlaylists();
  };

  const firstUnplayed = activePlaylist?.items.find(i => !i.is_played);

  return (
    <div className="flex h-full bg-bg-secondary">
      {/* Playlist list */}
      <div className="w-56 border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Playlists</span>
          <Button size="sm" variant="ghost" onClick={() => setShowCreate(true)}>+</Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {playlists.map(pl => (
            <div
              key={pl.id}
              onClick={() => setActivePlaylist(pl.id)}
              onContextMenu={e => { e.preventDefault(); handleDelete(pl.id); }}
              className={`px-3 py-2 cursor-pointer border-b border-border/30 transition-colors ${
                pl.id === activePlaylistId ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-bg-hover'
              }`}
            >
              <div className="text-sm text-text-primary truncate">{pl.name}</div>
              <div className="text-[10px] text-text-muted">
                {pl.items.length} songs
                {pl.event_date && ` \u00B7 ${pl.event_date}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active playlist */}
      <div className="flex-1 flex flex-col">
        {activePlaylist ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{activePlaylist.name}</h3>
                {activePlaylist.description && (
                  <p className="text-xs text-text-muted">{activePlaylist.description}</p>
                )}
              </div>
              <Button size="sm" variant="primary" onClick={() => setShowAddSong(true)}>Add Song</Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={activePlaylist.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {activePlaylist.items.map(item => (
                    <PlaylistItemRow
                      key={item.id}
                      item={item}
                      playlistId={activePlaylist.id}
                      onUpdate={fetchPlaylists}
                      isNext={item.id === firstUnplayed?.id}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              {activePlaylist.items.length === 0 && (
                <div className="py-8 text-center text-text-muted text-sm">
                  No songs in this playlist yet. Click "Add Song" to start.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            Select or create a playlist
          </div>
        )}
      </div>

      {/* Create playlist modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Playlist">
        <div className="flex flex-col gap-3">
          <input
            value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="Playlist name" autoFocus
            className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <input
            value={newDesc} onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <input
            type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            className="bg-bg-primary border border-border rounded-md px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
          />
          <Button variant="primary" onClick={handleCreate}>Create</Button>
        </div>
      </Modal>

      {/* Add song modal */}
      <Modal open={showAddSong} onClose={() => setShowAddSong(false)} title="Add Song to Playlist">
        <div className="max-h-[400px] overflow-y-auto">
          {songs.map(song => (
            <button
              key={song.id}
              onClick={() => handleAddSong(song.id)}
              className="w-full text-left px-3 py-2 hover:bg-bg-hover rounded-md flex items-center gap-2 transition-colors"
            >
              <span className="text-sm text-text-primary">{song.title}</span>
              <span className="text-xs text-text-muted">{song.artist}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
