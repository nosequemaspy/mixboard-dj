import { create } from 'zustand';
import type { SessionListItem, SessionData } from '../types';
import { api } from '../api/http';

interface SessionStore {
  sessions: SessionListItem[];
  activeSessionId: number | null;
  activeSession: SessionData | null;
  loading: boolean;
  sessionPasswords: Record<number, string>;
  fetchSessions: () => Promise<void>;
  setActiveSession: (id: number | null) => void;
  fetchActiveSession: (id: number) => Promise<void>;
  setPassword: (sessionId: number, password: string) => void;
  getPassword: (sessionId: number) => string | undefined;
  clearPassword: (sessionId: number) => void;
  restoreLastSession: () => void;
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
      set({ loading: false });
    }
  },

  setActiveSession: (id) => {
    saveActiveSessionId(id);
    if (id === null) {
      set({ activeSessionId: null, activeSession: null });
      return;
    }
    set({ activeSessionId: id });
    get().fetchActiveSession(id);
  },

  fetchActiveSession: async (id) => {
    try {
      const pw = get().sessionPasswords[id];
      const session = await api.getSession(id, pw);
      // Only update if this is still the active session
      if (get().activeSessionId === id) {
        set({ activeSession: session });
      }
    } catch {
      // ignore
    }
  },

  restoreLastSession: () => {
    const savedId = loadActiveSessionId();
    if (savedId !== null) {
      const state = get();
      // Only restore if no session is already active
      if (state.activeSessionId === null) {
        set({ activeSessionId: savedId });
        state.fetchActiveSession(savedId);
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
