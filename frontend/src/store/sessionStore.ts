import { create } from 'zustand';
import type { SessionListItem, SessionData } from '../types';
import { api } from '../api/http';

const OFFLINE_META_KEY = 'mixboard_offline_sessions';

/** Build a minimal sessions list from offline cache metadata as fallback */
function getOfflineFallbackSessions(): SessionListItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_META_KEY);
    if (!raw) return [];
    const meta: Record<string, { sessionName: string; cachedSongIds: number[] }> = JSON.parse(raw);
    return Object.entries(meta).map(([id, m]) => ({
      id: Number(id),
      name: m.sessionName,
      share_code: '',
      has_password: false,
      is_public: false,
      allow_suggestions: false,
      parent_session_id: null,
      created_at: '',
      updated_at: '',
      item_count: m.cachedSongIds.length,
      pending_suggestions: 0,
    }));
  } catch {
    return [];
  }
}

interface SessionStore {
  sessions: SessionListItem[];
  activeSessionId: number | null;
  activeSession: SessionData | null;
  loading: boolean;
  sessionPasswords: Record<number, string>;
  fetchSessions: () => Promise<void>;
  setActiveSession: (id: number | null) => Promise<void>;
  fetchActiveSession: (id: number) => Promise<void>;
  setPassword: (sessionId: number, password: string) => void;
  getPassword: (sessionId: number) => string | undefined;
  clearPassword: (sessionId: number) => void;
  restoreLastSession: () => Promise<void>;
}

const PASSWORDS_KEY = 'mixboard_session_passwords';
const ACTIVE_SESSION_KEY = 'mixboard_active_session_id';

function loadPasswords(): Record<number, string> {
  try {
    const raw = localStorage.getItem(PASSWORDS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePasswords(passwords: Record<number, string>) {
  localStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));
}

function loadActiveSessionId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

function saveActiveSessionId(id: number | null) {
  if (id !== null) {
    localStorage.setItem(ACTIVE_SESSION_KEY, String(id));
  } else {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeSession: null,
  loading: false,
  sessionPasswords: loadPasswords(),

  fetchSessions: async () => {
    set({ loading: true });
    try {
      const sessions = await api.getSessions();
      set({ sessions, loading: false });
    } catch {
      // Offline or network error — show cached sessions from offline metadata
      const fallback = getOfflineFallbackSessions();
      set({ sessions: fallback, loading: false });
    }
  },

  setActiveSession: async (id) => {
    saveActiveSessionId(id);
    if (id === null) {
      set({ activeSessionId: null, activeSession: null });
      return;
    }
    set({ activeSessionId: id });
    await get().fetchActiveSession(id);
  },

  fetchActiveSession: async (id) => {
    try {
      const pw = get().sessionPasswords[id];
      const session = await api.getSession(id, pw);
      // Only update if this is still the active session
      if (get().activeSessionId === id) {
        set({ activeSession: session });
      }
    } catch (err) {
      console.error('Failed to fetch session', id, err);
    }
  },

  restoreLastSession: async () => {
    const savedId = loadActiveSessionId();
    if (savedId !== null) {
      const state = get();
      // Only restore if no session is already active
      if (state.activeSessionId === null) {
        set({ activeSessionId: savedId });
        await state.fetchActiveSession(savedId);
      }
    }
  },

  setPassword: (sessionId, password) => {
    const passwords = { ...get().sessionPasswords, [sessionId]: password };
    savePasswords(passwords);
    set({ sessionPasswords: passwords });
  },

  getPassword: (sessionId) => {
    return get().sessionPasswords[sessionId];
  },

  clearPassword: (sessionId) => {
    const passwords = { ...get().sessionPasswords };
    delete passwords[sessionId];
    savePasswords(passwords);
    set({ sessionPasswords: passwords });
  },
}));
