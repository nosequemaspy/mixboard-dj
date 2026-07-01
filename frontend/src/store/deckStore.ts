import { create } from 'zustand';
import type { DeckId, DeckState, MuteSection, Song } from '../types';

const defaultDeck = (id: DeckId): DeckState => ({
  id,
  song: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  tempo: 1,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  vocalMuted: false,
  cuePoint: 0,
  muteSections: [],
  muteSectionsActive: true,
});

interface DeckStore {
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number; // -1 = full A, 0 = center, 1 = full B
  getDeck: (id: DeckId) => DeckState;
  loadSong: (id: DeckId, song: Song) => void;
  updateSongInDeck: (id: DeckId, updates: Partial<Song>) => void;
  setPlaying: (id: DeckId, playing: boolean) => void;
  setCurrentTime: (id: DeckId, time: number) => void;
  setDuration: (id: DeckId, duration: number) => void;
  setVolume: (id: DeckId, volume: number) => void;
  setTempo: (id: DeckId, tempo: number) => void;
  setEQ: (id: DeckId, band: 'eqLow' | 'eqMid' | 'eqHigh', value: number) => void;
  setVocalMuted: (id: DeckId, muted: boolean) => void;
  setCuePoint: (id: DeckId, time: number) => void;
  setMuteSections: (id: DeckId, sections: MuteSection[]) => void;
  setMuteSectionsActive: (id: DeckId, active: boolean) => void;
  setCrossfader: (value: number) => void;
}

export const useDeckStore = create<DeckStore>((set, get) => ({
  deckA: defaultDeck('A'),
  deckB: defaultDeck('B'),
  crossfader: 0,
  getDeck: (id) => id === 'A' ? get().deckA : get().deckB,
  loadSong: (id, song) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      song,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      cuePoint: 0,
      vocalMuted: false,
      muteSections: [],
      muteSectionsActive: true,
    },
  })),
  updateSongInDeck: (id, updates) => set(state => {
    const key = id === 'A' ? 'deckA' : 'deckB';
    const deck = state[key];
    if (!deck.song) return {};
    return {
      [key]: { ...deck, song: { ...deck.song, ...updates } },
    };
  }),
  setPlaying: (id, playing) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      isPlaying: playing,
    },
  })),
  setCurrentTime: (id, time) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      currentTime: time,
    },
  })),
  setDuration: (id, duration) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      duration,
    },
  })),
  setVolume: (id, volume) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      volume,
    },
  })),
  setTempo: (id, tempo) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      tempo,
    },
  })),
  setEQ: (id, band, value) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      [band]: value,
    },
  })),
  setVocalMuted: (id, muted) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      vocalMuted: muted,
    },
  })),
  setCuePoint: (id, time) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      cuePoint: time,
    },
  })),
  setMuteSections: (id, sections) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      muteSections: sections,
    },
  })),
  setMuteSectionsActive: (id, active) => set(state => ({
    [id === 'A' ? 'deckA' : 'deckB']: {
      ...state[id === 'A' ? 'deckA' : 'deckB'],
      muteSectionsActive: active,
    },
  })),
  setCrossfader: (value) => set({ crossfader: value }),
}));
