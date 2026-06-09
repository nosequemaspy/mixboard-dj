import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PlaylistItem as PlaylistItemType, DeckId } from '../../types';
import { useDeckStore } from '../../store/deckStore';
import { getAudioEngine } from '../../hooks/useAudioEngine';
import { api } from '../../api/http';

interface PlaylistItemProps {
  item: PlaylistItemType;
  playlistId: number;
  onUpdate: () => void;
  isNext: boolean;
}

export function PlaylistItemRow({ item, playlistId, onUpdate, isNext }: PlaylistItemProps) {
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
    await api.updatePlaylistItem(playlistId, item.id, { is_played: !item.is_played });
    onUpdate();
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
      </div>
    </div>
  );
}
