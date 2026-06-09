import { create } from 'zustand';
import type { AudioSettings, CrossfaderCurve } from '../types';
import { api } from '../api/http';

const STORAGE_KEY = 'mixboard_settings';

const defaultSettings: AudioSettings = {
  masterDeviceId: '',
  headphoneDeviceId: '',
  masterVolume: 1,
  headphoneVolume: 0.8,
  headphoneCueMix: 0,
  cueA: false,
  cueB: false,
  crossfaderCurve: 'smooth',
};

function loadLocalSettings(): AudioSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultSettings, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...defaultSettings };
}

function saveLocalSettings(settings: AudioSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Convert frontend camelCase to backend snake_case
function toSnakeCase(settings: Partial<AudioSettings>): Record<string, unknown> {
  const map: Record<string, string> = {
    masterDeviceId: 'master_device_id',
    headphoneDeviceId: 'headphone_device_id',
    masterVolume: 'master_volume',
    headphoneVolume: 'headphone_volume',
    headphoneCueMix: 'headphone_cue_mix',
    cueA: 'cue_a',
    cueB: 'cue_b',
    crossfaderCurve: 'crossfader_curve',
  };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings)) {
    const snakeKey = map[key] || key;
    result[snakeKey] = value;
  }
  return result;
}

// Convert backend snake_case to frontend camelCase
function fromSnakeCase(data: Record<string, unknown>): Partial<AudioSettings> {
  return {
    masterDeviceId: (data.master_device_id as string) ?? '',
    headphoneDeviceId: (data.headphone_device_id as string) ?? '',
    masterVolume: (data.master_volume as number) ?? 1,
    headphoneVolume: (data.headphone_volume as number) ?? 0.8,
    headphoneCueMix: (data.headphone_cue_mix as number) ?? 0,
    cueA: (data.cue_a as boolean) ?? false,
    cueB: (data.cue_b as boolean) ?? false,
    crossfaderCurve: (data.crossfader_curve as CrossfaderCurve) ?? 'smooth',
  };
}

// Debounce timer for API updates
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingUpdate: Record<string, unknown> = {};

function flushToApi() {
  if (Object.keys(pendingUpdate).length === 0) return;
  const data = { ...pendingUpdate };
  pendingUpdate = {};
  api.updateSettings(data).catch(() => {
    // silently fail - localStorage is the fallback
  });
}

function scheduleApiUpdate(partial: Partial<AudioSettings>) {
  const snaked = toSnakeCase(partial);
  pendingUpdate = { ...pendingUpdate, ...snaked };
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushToApi, 500);
}

interface SettingsStore extends AudioSettings {
  setMasterDeviceId: (id: string) => void;
  setHeadphoneDeviceId: (id: string) => void;
  setMasterVolume: (value: number) => void;
  setHeadphoneVolume: (value: number) => void;
  setHeadphoneCueMix: (value: number) => void;
  setCueA: (enabled: boolean) => void;
  setCueB: (enabled: boolean) => void;
  setCrossfaderCurve: (curve: CrossfaderCurve) => void;
  getSettings: () => AudioSettings;
  loadFromApi: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const initial = loadLocalSettings();

  const persist = (partial: Partial<AudioSettings>) => {
    set(partial);
    const state = get();
    const allSettings: AudioSettings = {
      masterDeviceId: state.masterDeviceId,
      headphoneDeviceId: state.headphoneDeviceId,
      masterVolume: state.masterVolume,
      headphoneVolume: state.headphoneVolume,
      headphoneCueMix: state.headphoneCueMix,
      cueA: state.cueA,
      cueB: state.cueB,
      crossfaderCurve: state.crossfaderCurve,
    };
    saveLocalSettings(allSettings);
    scheduleApiUpdate(partial);
  };

  return {
    ...initial,
    setMasterDeviceId: (id) => persist({ masterDeviceId: id }),
    setHeadphoneDeviceId: (id) => persist({ headphoneDeviceId: id }),
    setMasterVolume: (value) => persist({ masterVolume: value }),
    setHeadphoneVolume: (value) => persist({ headphoneVolume: value }),
    setHeadphoneCueMix: (value) => persist({ headphoneCueMix: value }),
    setCueA: (enabled) => persist({ cueA: enabled }),
    setCueB: (enabled) => persist({ cueB: enabled }),
    setCrossfaderCurve: (curve) => persist({ crossfaderCurve: curve }),
    getSettings: () => {
      const s = get();
      return {
        masterDeviceId: s.masterDeviceId,
        headphoneDeviceId: s.headphoneDeviceId,
        masterVolume: s.masterVolume,
        headphoneVolume: s.headphoneVolume,
        headphoneCueMix: s.headphoneCueMix,
        cueA: s.cueA,
        cueB: s.cueB,
        crossfaderCurve: s.crossfaderCurve,
      };
    },
    loadFromApi: async () => {
      try {
        const data = await api.getSettings();
        const settings = fromSnakeCase(data);
        set(settings);
        saveLocalSettings({ ...defaultSettings, ...settings });
      } catch {
        // API unavailable - keep localStorage values
      }
    },
  };
});

// Load settings from API on startup
useSettingsStore.getState().loadFromApi();
