import { create } from 'zustand';
import type { Playlist } from '../types';
import { api } from '../api/http';

interface PlaylistStore {
  playlists: Playlist[];
  activePlaylistId: number | null;
  loading: boolean;
  fetchPlaylists: () => Promise<void>;
  setActivePlaylist: (id: number | null) => void;
  getActivePlaylist: () => Playlist | undefined;
}

export const usePlaylistStore = create<PlaylistStore>((set, get) => ({
  playlists: [],
  activePlaylistId: null,
  loading: false,
  fetchPlaylists: async () => {
    set({ loading: true });
    try {
      const playlists = await api.getPlaylists();
      set({ playlists, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  setActivePlaylist: (id) => set({ activePlaylistId: id }),
  getActivePlaylist: () => {
    const { playlists, activePlaylistId } = get();
    return playlists.find(p => p.id === activePlaylistId);
  },
}));
