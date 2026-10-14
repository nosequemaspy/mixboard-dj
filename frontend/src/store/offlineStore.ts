import { create } from 'zustand';
import { api } from '../api/http';
import { useSessionStore } from './sessionStore';
import type { SessionItem } from '../types';

const OFFLINE_CACHE = 'mixboard-offline';
const OFFLINE_META_KEY = 'mixboard_offline_sessions';

interface CachedSessionMeta {
  sessionName: string;
  cachedSongIds: number[];
  cacheSize: number;
  lastCachedAt: string;
}

interface ActiveDownload {
  sessionId: number;
  folderId: number | null;
  totalSongs: number;
  completedSongs: number;
  currentSongTitle: string;
  abortController: AbortController;
}

interface OfflineStore {
  cachedSessions: Record<number, CachedSessionMeta>;
  activeDownload: ActiveDownload | null;
  isOnline: boolean;

  downloadSession: (sessionId: number, folderId?: number | null) => Promise<void>;
  cancelDownload: () => void;
  clearSessionCache: (sessionId: number) => Promise<void>;
  isSongCached: (songId: number) => boolean;
  getCachedSongIds: () => Set<number>;
  initOnlineStatus: () => () => void;
  loadMeta: () => void;
}

function loadMeta(): Record<number, CachedSessionMeta> {
  try {
    const raw = localStorage.getItem(OFFLINE_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMeta(meta: Record<number, CachedSessionMeta>) {
  localStorage.setItem(OFFLINE_META_KEY, JSON.stringify(meta));
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  cachedSessions: loadMeta(),
  activeDownload: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  loadMeta: () => {
    set({ cachedSessions: loadMeta() });
  },

  initOnlineStatus: () => {
    const onOnline = () => set({ isOnline: true });
    const onOffline = () => set({ isOnline: false });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  },

  isSongCached: (songId: number) => {
    const { cachedSessions } = get();
    return Object.values(cachedSessions).some(s => s.cachedSongIds.includes(songId));
  },

  getCachedSongIds: () => {
    const { cachedSessions } = get();
    const ids = new Set<number>();
    for (const s of Object.values(cachedSessions)) {
      for (const id of s.cachedSongIds) ids.add(id);
    }
    return ids;
  },

  downloadSession: async (sessionId: number, folderId: number | null = null) => {
    if (get().activeDownload) return; // Already downloading

    const abortController = new AbortController();
    const { signal } = abortController;

    // Get session data
    const password = useSessionStore.getState().getPassword(sessionId);
    let sessionData;
    try {
      sessionData = await api.getSession(sessionId, password);
    } catch {
      return;
    }

    // Cache session metadata response
    const cache = await caches.open(OFFLINE_CACHE);
    const sessionUrl = `/api/sessions/${sessionId}`;
    const sessionResponse = new Response(JSON.stringify(sessionData), {
      headers: { 'Content-Type': 'application/json' },
    });
    await cache.put(new Request(sessionUrl), sessionResponse);

    // Determine which songs to download
    let items: SessionItem[] = sessionData.items || [];
    if (folderId !== null) {
      items = items.filter((i: SessionItem) => (i.folder_ids ?? []).includes(folderId));
    }
    // Filter to actual songs (no separators)
    items = items.filter((i: SessionItem) => i.song && !i.separator_text);

    const sessionName = folderId !== null
      ? (sessionData.folders || []).find((f: { id: number; name: string }) => f.id === folderId)?.name || sessionData.name
      : sessionData.name;

    set({
      activeDownload: {
        sessionId,
        folderId,
        totalSongs: items.length,
        completedSongs: 0,
        currentSongTitle: items[0]?.song?.title || '',
        abortController,
      },
    });

    const cachedSongIds: number[] = [];
    let cacheSize = 0;

    for (let i = 0; i < items.length; i++) {
      if (signal.aborted) break;

      const item = items[i];
      const songId = item.song_id;

      set({
        activeDownload: {
          ...get().activeDownload!,
          completedSongs: i,
          currentSongTitle: item.song.title,
        },
      });

      try {
        // Check if already cached
        const audioUrl = `/api/audio/stream/${songId}`;
        const existing = await cache.match(new Request(audioUrl), { ignoreSearch: true });
        if (!existing) {
          // Download audio
          const audioResponse = await fetch(api.streamUrl(songId), { signal });
          if (audioResponse.ok) {
            const blob = await audioResponse.blob();
            cacheSize += blob.size;
            // Store with clean pathname (no query params)
            await cache.put(new Request(audioUrl), new Response(blob, {
              headers: {
                'Content-Type': audioResponse.headers.get('Content-Type') || 'audio/mpeg',
                'Content-Length': String(blob.size),
              },
            }));
          }
        } else {
          // Already cached, count its size
          const blob = await existing.blob();
          cacheSize += blob.size;
        }

        // Download instrumental stem if available
        if (item.song.stems_status === 'ready' && item.song.stems?.length > 0) {
          const stemUrl = `/api/audio/stem-by-type/${songId}/instrumental`;
          const existingStem = await cache.match(new Request(stemUrl), { ignoreSearch: true });
          if (!existingStem) {
            try {
              const stemResponse = await fetch(api.stemByTypeUrl(songId, 'instrumental'), { signal });
              if (stemResponse.ok) {
                const stemBlob = await stemResponse.blob();
                cacheSize += stemBlob.size;
                await cache.put(new Request(stemUrl), new Response(stemBlob, {
                  headers: {
                    'Content-Type': stemResponse.headers.get('Content-Type') || 'audio/mpeg',
                    'Content-Length': String(stemBlob.size),
                  },
                }));
              }
            } catch {
              // Stem download failed, not critical
            }
          }
        }

        cachedSongIds.push(songId);
      } catch (err) {
        if (signal.aborted) break;
        // Individual song failed, continue with next
        console.warn(`Failed to cache song ${songId}:`, err);
      }
    }

    // Save metadata
    const meta = loadMeta();
    const existingIds = meta[sessionId]?.cachedSongIds || [];
    const mergedIds = [...new Set([...existingIds, ...cachedSongIds])];
    meta[sessionId] = {
      sessionName,
      cachedSongIds: mergedIds,
      cacheSize: (meta[sessionId]?.cacheSize || 0) + cacheSize,
      lastCachedAt: new Date().toISOString(),
    };
    saveMeta(meta);

    set({
      activeDownload: null,
      cachedSessions: { ...meta },
    });
  },

  cancelDownload: () => {
    const { activeDownload } = get();
    if (activeDownload) {
      activeDownload.abortController.abort();
      set({ activeDownload: null });
    }
  },

  clearSessionCache: async (sessionId: number) => {
    const meta = loadMeta();
    const sessionMeta = meta[sessionId];
    if (!sessionMeta) return;

    const cache = await caches.open(OFFLINE_CACHE);

    // Check which songIds are used by other sessions
    const otherSessionSongIds = new Set<number>();
    for (const [id, s] of Object.entries(meta)) {
      if (Number(id) !== sessionId) {
        for (const songId of s.cachedSongIds) otherSessionSongIds.add(songId);
      }
    }

    // Only delete songs not used by other sessions
    for (const songId of sessionMeta.cachedSongIds) {
      if (!otherSessionSongIds.has(songId)) {
        await cache.delete(new Request(`/api/audio/stream/${songId}`), { ignoreSearch: true });
        await cache.delete(new Request(`/api/audio/stem-by-type/${songId}/instrumental`), { ignoreSearch: true });
      }
    }

    // Delete session metadata cache
    await cache.delete(new Request(`/api/sessions/${sessionId}`));

    delete meta[sessionId];
    saveMeta(meta);
    set({ cachedSessions: { ...meta } });
  },
}));
