import { create } from 'zustand';
import type { SessionItem, SessionFolder, QueueEntry } from '../types';
import { getEffectivePlaybackSettings } from '../types';
import { api } from '../api/http';
import { useSessionStore } from './sessionStore';

interface PlayerStore {
  // Session binding
  sessionId: number | null;
  sessionItems: SessionItem[];
  folders: SessionFolder[];

  // Playback state
  currentItemId: number | null;
  currentSongId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  // Tag navigation
  activeTagId: number | null;
  mainPlaylistPosition: number; // saved position when entering a tag

  // Queue
  queue: QueueEntry[];

  // Shuffle
  shuffleEnabled: boolean;
  shuffledOrder: number[]; // indices into filtered items

  // Played tracking (by song_id, not item id)
  playedSongIds: Set<number>;

  // Transition state
  isTransitioning: boolean;
  nextTransitionSongTitle: string | null;
  setTransitionState: (isTransitioning: boolean, nextSongTitle: string | null) => void;

  // Session player mode (embedded in Sessions panel)
  sessionPlayerActive: boolean;
  toggleSessionPlayer: () => void;

  // Restricted mode
  restrictedMode: boolean;
  toggleRestrictedMode: () => void;

  // Actions
  loadSession: (sessionId: number) => void;
  syncFromSessionStore: () => void;
  playItem: (item: SessionItem) => void;
  playNext: () => void;
  playPrevious: () => void;
  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  addToQueue: (item: SessionItem) => void;
  removeFromQueue: (index: number) => void;
  setActiveTag: (tagId: number | null) => void;
  markPlayed: (songId: number) => void;
  resetAllPlayed: () => void;
  toggleShuffle: () => void;
  getNextItem: () => SessionItem | null;
  getPreviousItem: () => SessionItem | null;
  getFilteredItems: () => SessionItem[];
  getCurrentPlaybackSpeed: () => number;
}

function fisherYatesShuffle(arr: number[]): number[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  sessionId: null,
  sessionItems: [],
  folders: [],
  currentItemId: null,
  currentSongId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  activeTagId: null,
  mainPlaylistPosition: 0,
  queue: [],
  shuffleEnabled: false,
  shuffledOrder: [],
  playedSongIds: new Set(),
  isTransitioning: false,
  nextTransitionSongTitle: null,
  sessionPlayerActive: false,
  restrictedMode: true,

  setTransitionState: (isTransitioning, nextSongTitle) => {
    set({ isTransitioning, nextTransitionSongTitle: nextSongTitle });
  },

  toggleSessionPlayer: () => {
    set(state => ({ sessionPlayerActive: !state.sessionPlayerActive }));
  },

  toggleRestrictedMode: () => {
    set(state => ({ restrictedMode: !state.restrictedMode }));
  },

  loadSession: (sessionId) => {
    const sessionStore = useSessionStore.getState();
    const session = sessionStore.activeSession;
    if (session && session.id === sessionId) {
      const items = session.items || [];
      const folders = session.folders || [];
      const playedIds = new Set(
        items.filter(i => i.is_played).map(i => i.song_id)
      );
      set({
        sessionId,
        sessionItems: items,
        folders,
        playedSongIds: playedIds,
        activeTagId: null,
        queue: [],
        currentItemId: null,
        currentSongId: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        mainPlaylistPosition: 0,
      });
    }
  },

  syncFromSessionStore: () => {
    const sessionStore = useSessionStore.getState();
    const state = get();
    if (!sessionStore.activeSession || sessionStore.activeSession.id !== state.sessionId) return;
    const items = sessionStore.activeSession.items || [];
    const folders = sessionStore.activeSession.folders || [];
    set({ sessionItems: items, folders });
  },

  getFilteredItems: () => {
    const { sessionItems, activeTagId } = get();
    if (activeTagId === null) {
      // "Todas" - all items sorted by position, exclude separators
      return sessionItems
        .filter(i => i.song && !i.separator_text)
        .sort((a, b) => a.position - b.position);
    }
    // Tag/folder items sorted by folder_position
    return sessionItems
      .filter(i => i.folder_id === activeTagId && i.song && !i.separator_text)
      .sort((a, b) => (a.folder_position ?? 0) - (b.folder_position ?? 0));
  },

  playItem: (item) => {
    set({
      currentItemId: item.id,
      currentSongId: item.song_id,
      isPlaying: true,
      currentTime: 0,
      duration: item.song.duration_seconds,
    });
  },

  getNextItem: () => {
    const { queue, currentItemId, playedSongIds, shuffleEnabled, shuffledOrder } = get();
    const filtered = get().getFilteredItems();

    // Queue takes priority
    if (queue.length > 0) {
      return queue[0].item;
    }

    if (filtered.length === 0) return null;

    const currentIndex = filtered.findIndex(i => i.id === currentItemId);

    if (shuffleEnabled && shuffledOrder.length > 0) {
      // Find current position in shuffled order
      const shufflePos = shuffledOrder.indexOf(currentIndex);
      // Look forward in shuffled order for unplayed songs
      for (let offset = 1; offset <= shuffledOrder.length; offset++) {
        const nextShufflePos = (shufflePos + offset) % shuffledOrder.length;
        const nextIndex = shuffledOrder[nextShufflePos];
        const item = filtered[nextIndex];
        if (item && !playedSongIds.has(item.song_id)) {
          return item;
        }
      }
      return null; // All played
    }

    // Linear order: find next unplayed
    for (let offset = 1; offset <= filtered.length; offset++) {
      const nextIndex = (currentIndex + offset) % filtered.length;
      const item = filtered[nextIndex];
      if (item && !playedSongIds.has(item.song_id)) {
        return item;
      }
    }
    return null; // All played
  },

  getPreviousItem: () => {
    const { currentItemId, shuffleEnabled, shuffledOrder } = get();
    const filtered = get().getFilteredItems();
    if (filtered.length === 0) return null;

    const currentIndex = filtered.findIndex(i => i.id === currentItemId);

    if (shuffleEnabled && shuffledOrder.length > 0) {
      const shufflePos = shuffledOrder.indexOf(currentIndex);
      for (let offset = 1; offset <= shuffledOrder.length; offset++) {
        const prevShufflePos = (shufflePos - offset + shuffledOrder.length) % shuffledOrder.length;
        const prevIndex = shuffledOrder[prevShufflePos];
        const item = filtered[prevIndex];
        if (item) return item;
      }
      return null;
    }

    // Linear: go backwards, allow replaying played songs when going back
    if (currentIndex > 0) {
      return filtered[currentIndex - 1];
    }
    return null;
  },

  playNext: () => {
    const state = get();
    const { queue } = state;

    // Consume from queue first
    if (queue.length > 0) {
      const next = queue[0].item;
      set({ queue: queue.slice(1) });
      state.playItem(next);
      return;
    }

    const nextItem = state.getNextItem();
    if (nextItem) {
      state.playItem(nextItem);
    } else {
      // No more songs
      set({ isPlaying: false });
    }
  },

  playPrevious: () => {
    const state = get();
    // If we're more than 3 seconds in, restart current song
    if (state.currentTime > 3) {
      set({ currentTime: 0 });
      return;
    }
    const prevItem = state.getPreviousItem();
    if (prevItem) {
      state.playItem(prevItem);
    }
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),

  addToQueue: (item) => {
    set(state => ({ queue: [...state.queue, { item, source: 'manual' }] }));
  },

  removeFromQueue: (index) => {
    set(state => ({
      queue: state.queue.filter((_, i) => i !== index),
    }));
  },

  setActiveTag: (tagId) => {
    const state = get();
    if (tagId === null && state.activeTagId !== null) {
      // Returning to "Todas" — no special position restore needed
      set({ activeTagId: null });
    } else {
      // Save current position before switching to tag
      const filtered = state.getFilteredItems();
      const currentIndex = filtered.findIndex(i => i.id === state.currentItemId);
      set({
        activeTagId: tagId,
        mainPlaylistPosition: currentIndex >= 0 ? currentIndex : 0,
      });
    }
    // Regenerate shuffle order for new view
    if (get().shuffleEnabled) {
      const filtered = get().getFilteredItems();
      const unplayedIndices = filtered
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => !get().playedSongIds.has(item.song_id))
        .map(({ i }) => i);
      set({ shuffledOrder: fisherYatesShuffle(unplayedIndices) });
    }
  },

  markPlayed: (songId) => {
    const state = get();
    const newPlayed = new Set(state.playedSongIds);
    newPlayed.add(songId);
    set({ playedSongIds: newPlayed });

    // Persist to backend
    if (state.sessionId) {
      const password = useSessionStore.getState().getPassword(state.sessionId);
      api.markSongPlayed(state.sessionId, songId, true, password).catch(() => {});
    }
  },

  resetAllPlayed: () => {
    const state = get();
    set({ playedSongIds: new Set() });

    if (state.sessionId) {
      const password = useSessionStore.getState().getPassword(state.sessionId);
      api.resetAllPlayed(state.sessionId, password).catch(() => {});
    }

    // Regenerate shuffle
    if (state.shuffleEnabled) {
      const filtered = get().getFilteredItems();
      const indices = filtered.map((_, i) => i);
      set({ shuffledOrder: fisherYatesShuffle(indices) });
    }
  },

  toggleShuffle: () => {
    const state = get();
    const newEnabled = !state.shuffleEnabled;
    if (newEnabled) {
      const filtered = state.getFilteredItems();
      const unplayedIndices = filtered
        .map((item, i) => ({ item, i }))
        .filter(({ item }) => !state.playedSongIds.has(item.song_id))
        .map(({ i }) => i);
      set({
        shuffleEnabled: true,
        shuffledOrder: fisherYatesShuffle(unplayedIndices),
      });
    } else {
      set({ shuffleEnabled: false, shuffledOrder: [] });
    }
  },

  getCurrentPlaybackSpeed: () => {
    const { currentItemId, sessionItems } = get();
    if (!currentItemId) return 1.0;
    const item = sessionItems.find(i => i.id === currentItemId);
    if (!item) return 1.0;
    return getEffectivePlaybackSettings(item).playback_speed;
  },
}));
