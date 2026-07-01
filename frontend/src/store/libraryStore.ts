import { create } from 'zustand';
import type { Song, Category } from '../types';
import { api } from '../api/http';

interface LibraryStore {
  songs: Song[];
  categories: Category[];
  search: string;
  selectedCategoryId: number | null;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  loading: boolean;
  stemSeparationStatus: Record<number, 'processing' | 'ready' | 'error'>;
  setSearch: (search: string) => void;
  setSelectedCategory: (id: number | null) => void;
  setSort: (field: string, dir: 'asc' | 'desc') => void;
  fetchSongs: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  addSong: (song: Song) => void;
  removeSong: (id: number) => void;
  startStemSeparation: (songId: number) => void;
  getStemStatus: (songId: number) => 'processing' | 'ready' | 'error' | null;
}

const stemPollingIntervals: Record<number, ReturnType<typeof setInterval>> = {};

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  songs: [],
  categories: [],
  search: '',
  selectedCategoryId: null,
  sortBy: 'created_at',
  sortDir: 'desc',
  loading: false,
  stemSeparationStatus: {},
  setSearch: (search) => set({ search }),
  setSelectedCategory: (id) => set({ selectedCategoryId: id }),
  setSort: (field, dir) => set({ sortBy: field, sortDir: dir }),
  fetchSongs: async () => {
    set({ loading: true });
    try {
      const { search, selectedCategoryId, sortBy, sortDir } = get();
      const data = await api.getSongs({
        search: search || undefined,
        category_id: selectedCategoryId || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      set({ songs: data.songs, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  fetchCategories: async () => {
    try {
      const cats = await api.getCategories();
      set({ categories: cats });
    } catch { /* ignore */ }
  },
  addSong: (song) => set(state => ({ songs: [song, ...state.songs] })),
  removeSong: (id) => set(state => ({ songs: state.songs.filter(s => s.id !== id) })),
  startStemSeparation: (songId: number) => {
    // Set status to processing
    set(state => ({
      stemSeparationStatus: { ...state.stemSeparationStatus, [songId]: 'processing' },
    }));

    // Clear any existing polling for this song
    if (stemPollingIntervals[songId]) {
      clearInterval(stemPollingIntervals[songId]);
    }

    // Start polling
    const poll = setInterval(async () => {
      try {
        await get().fetchSongs();
        const song = get().songs.find(s => s.id === songId);
        if (song && (song.stems_status === 'ready' || song.stems_status === 'error')) {
          set(state => ({
            stemSeparationStatus: {
              ...state.stemSeparationStatus,
              [songId]: song.stems_status as 'ready' | 'error',
            },
          }));
          clearInterval(poll);
          delete stemPollingIntervals[songId];
        }
      } catch { /* ignore */ }
    }, 3000);

    stemPollingIntervals[songId] = poll;

    // Timeout after 2 minutes
    setTimeout(() => {
      if (stemPollingIntervals[songId]) {
        clearInterval(stemPollingIntervals[songId]);
        delete stemPollingIntervals[songId];
        const current = get().stemSeparationStatus[songId];
        if (current === 'processing') {
          set(state => ({
            stemSeparationStatus: {
              ...state.stemSeparationStatus,
              [songId]: 'error',
            },
          }));
        }
      }
    }, 120000);
  },
  getStemStatus: (songId: number) => {
    return get().stemSeparationStatus[songId] ?? null;
  },
}));
