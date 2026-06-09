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
  setSearch: (search: string) => void;
  setSelectedCategory: (id: number | null) => void;
  setSort: (field: string, dir: 'asc' | 'desc') => void;
  fetchSongs: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  addSong: (song: Song) => void;
  removeSong: (id: number) => void;
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  songs: [],
  categories: [],
  search: '',
  selectedCategoryId: null,
  sortBy: 'created_at',
  sortDir: 'desc',
  loading: false,
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
}));
