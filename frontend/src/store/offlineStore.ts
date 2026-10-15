import { create } from 'zustand';
import { api } from '../api/http';
import { useSessionStore } from './sessionStore';
import type { SessionItem } from '../types';

const OFFLINE_CACHE = 'mixboard-offline';
const OFFLINE_META_KEY = 'mixboard_offline_sessions';

// Average song size estimate (~7MB per song for estimation before download)
const AVG_SONG_SIZE_BYTES = 7 * 1024 * 1024;
// Minimum free space buffer to keep (50MB)
const MIN_FREE_SPACE_BUFFER = 50 * 1024 * 1024;

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
  failedSongs: number;
  abortController: AbortController;
}

type DownloadError =
  | { type: 'storage_low'; available: number; required: number }
  | { type: 'storage_full'; songTitle: string }
  | { type: 'download_failed'; message: string }
  | { type: 'partial_complete'; completed: number; failed: number; total: number }
  | null;

interface OfflineStore {
  cachedSessions: Record<number, CachedSessionMeta>;
  activeDownload: ActiveDownload | null;
  isOnline: boolean;
  lastError: DownloadError;

  downloadSession: (sessionId: number, folderId?: number | null) => Promise<void>;
  cancelDownload: () => void;
  clearSessionCache: (sessionId: number) => Promise<void>;
  clearAllCache: () => Promise<void>;
  isSongCached: (songId: number) => boolean;
  getCachedSongIds: () => Set<number>;
  initOnlineStatus: () => () => void;
  syncMetaWithCache: () => Promise<void>;
  clearError: () => void;
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

/** Request persistent storage to avoid browser eviction */
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported or denied — continue anyway
  }
}

/** Estimate available storage space */
async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }
  } catch {
    // Not supported
  }
  return null;
}

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  cachedSessions: loadMeta(),
  activeDownload: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastError: null,

  clearError: () => set({ lastError: null }),

  initOnlineStatus: () => {
    const onOnline = () => set({ isOnline: true });
    const onOffline = () => set({ isOnline: false });
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    // Sync metadata with actual cache on startup
    get().syncMetaWithCache();

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  },

  /** Verify metadata against actual Cache API contents — remove stale entries */
  syncMetaWithCache: async () => {
    const meta = loadMeta();
    let changed = false;

    try {
      const cache = await caches.open(OFFLINE_CACHE);

      for (const [sessionIdStr, sessionMeta] of Object.entries(meta)) {
        const validSongIds: number[] = [];
        let validSize = 0;

        for (const songId of sessionMeta.cachedSongIds) {
          const audioUrl = `/api/audio/stream/${songId}`;
          const cached = await cache.match(new Request(audioUrl), { ignoreSearch: true });
          if (cached) {
            validSongIds.push(songId);
            try {
              const blob = await cached.blob();
              validSize += blob.size;
            } catch {
              validSongIds.pop(); // couldn't read blob, remove
              changed = true;
            }
          } else {
            changed = true;
          }
        }

        if (validSongIds.length === 0) {
          delete meta[Number(sessionIdStr)];
          changed = true;
        } else if (validSongIds.length !== sessionMeta.cachedSongIds.length) {
          meta[Number(sessionIdStr)] = {
            ...sessionMeta,
            cachedSongIds: validSongIds,
            cacheSize: validSize,
          };
          changed = true;
        } else if (validSize !== sessionMeta.cacheSize) {
          meta[Number(sessionIdStr)].cacheSize = validSize;
          changed = true;
        }
      }
    } catch {
      // Cache API unavailable — clear all metadata
      for (const key of Object.keys(meta)) delete meta[Number(key)];
      changed = true;
    }

    if (changed) {
      saveMeta(meta);
      set({ cachedSessions: { ...meta } });
    }
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
    if (get().activeDownload) return;
    set({ lastError: null });

    const abortController = new AbortController();
    const { signal } = abortController;

    // Request persistent storage to avoid eviction
    await requestPersistentStorage();

    // Get session data
    const password = useSessionStore.getState().getPassword(sessionId);
    let sessionData;
    try {
      sessionData = await api.getSession(sessionId, password);
    } catch (err) {
      set({ lastError: { type: 'download_failed', message: 'No se pudo cargar la sesion' } });
      return;
    }

    // Cache session metadata response
    let cache: Cache;
    try {
      cache = await caches.open(OFFLINE_CACHE);
    } catch {
      set({ lastError: { type: 'download_failed', message: 'Cache API no disponible' } });
      return;
    }

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
    items = items.filter((i: SessionItem) => i.song && !i.separator_text);

    if (items.length === 0) {
      set({ lastError: { type: 'download_failed', message: 'No hay canciones para descargar' } });
      return;
    }

    const sessionName = folderId !== null
      ? (sessionData.folders || []).find((f: { id: number; name: string }) => f.id === folderId)?.name || sessionData.name
      : sessionData.name;

    // ── Storage estimation ──
    // Count how many songs are NOT already cached
    const alreadyCached = get().getCachedSongIds();
    const newSongsCount = items.filter(i => !alreadyCached.has(i.song_id)).length;

    if (newSongsCount > 0) {
      const estimatedNeeded = newSongsCount * AVG_SONG_SIZE_BYTES;
      const storageInfo = await getStorageEstimate();
      if (storageInfo) {
        const available = storageInfo.quota - storageInfo.usage;
        if (available < estimatedNeeded + MIN_FREE_SPACE_BUFFER) {
          set({
            lastError: {
              type: 'storage_low',
              available: Math.max(0, available - MIN_FREE_SPACE_BUFFER),
              required: estimatedNeeded,
            },
          });
          return;
        }
      }
    }

    set({
      activeDownload: {
        sessionId,
        folderId,
        totalSongs: items.length,
        completedSongs: 0,
        currentSongTitle: items[0]?.song?.title || '',
        failedSongs: 0,
        abortController,
      },
    });

    const cachedSongIds: number[] = [];
    let cacheSize = 0;
    let failedCount = 0;
    let storageFull = false;

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
        const audioUrl = `/api/audio/stream/${songId}`;

        // Always re-download to handle file replacements (force re-cache)
        const audioResponse = await fetch(api.streamUrl(songId), { signal });
        if (audioResponse.ok) {
          const blob = await audioResponse.blob();
          cacheSize += blob.size;

          try {
            await cache.put(new Request(audioUrl), new Response(blob, {
              headers: {
                'Content-Type': audioResponse.headers.get('Content-Type') || 'audio/mpeg',
                'Content-Length': String(blob.size),
              },
            }));
          } catch (putErr) {
            // cache.put failed — likely storage full
            storageFull = true;
            failedCount++;
            set({
              activeDownload: {
                ...get().activeDownload!,
                failedSongs: failedCount,
              },
            });

            // Check if quota exceeded
            const storageInfo = await getStorageEstimate();
            if (storageInfo && (storageInfo.quota - storageInfo.usage) < MIN_FREE_SPACE_BUFFER) {
              // Actually out of space — stop downloading
              set({
                lastError: { type: 'storage_full', songTitle: item.song.title },
              });
              break;
            }
            // Otherwise just this put failed, continue trying
            continue;
          }
        } else {
          failedCount++;
          set({
            activeDownload: { ...get().activeDownload!, failedSongs: failedCount },
          });
          continue;
        }

        // Download instrumental stem if available
        if (item.song.stems_status === 'ready' && item.song.stems?.length > 0) {
          const stemUrl = `/api/audio/stem-by-type/${songId}/instrumental`;
          try {
            const stemResponse = await fetch(api.stemByTypeUrl(songId, 'instrumental'), { signal });
            if (stemResponse.ok) {
              const stemBlob = await stemResponse.blob();
              cacheSize += stemBlob.size;
              try {
                await cache.put(new Request(stemUrl), new Response(stemBlob, {
                  headers: {
                    'Content-Type': stemResponse.headers.get('Content-Type') || 'audio/mpeg',
                    'Content-Length': String(stemBlob.size),
                  },
                }));
              } catch {
                // Stem cache put failed — not critical
              }
            }
          } catch {
            // Stem download failed — not critical
          }
        }

        cachedSongIds.push(songId);
      } catch (err) {
        if (signal.aborted) break;
        failedCount++;
        set({
          activeDownload: { ...get().activeDownload!, failedSongs: failedCount },
        });
        console.warn(`Failed to cache song ${songId}:`, err);
      }
    }

    // Save metadata — recalculate size from actual cached content
    const meta = loadMeta();
    const allCachedIds = [...new Set([
      ...(meta[sessionId]?.cachedSongIds || []),
      ...cachedSongIds,
    ])];
    meta[sessionId] = {
      sessionName,
      cachedSongIds: allCachedIds,
      cacheSize: (meta[sessionId]?.cacheSize || 0) + cacheSize,
      lastCachedAt: new Date().toISOString(),
    };
    saveMeta(meta);

    // Report result
    const total = items.length;
    const completed = cachedSongIds.length;

    set({
      activeDownload: null,
      cachedSessions: { ...meta },
      lastError: (failedCount > 0 && !storageFull)
        ? { type: 'partial_complete', completed, failed: failedCount, total }
        : storageFull
          ? get().lastError // already set above
          : null,
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

    try {
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
    } catch {
      // Cache API failed — just clear metadata
    }

    delete meta[sessionId];
    saveMeta(meta);
    set({ cachedSessions: { ...meta } });
  },

  clearAllCache: async () => {
    try {
      await caches.delete(OFFLINE_CACHE);
    } catch {
      // ignore
    }
    const meta: Record<number, CachedSessionMeta> = {};
    saveMeta(meta);
    set({ cachedSessions: meta });
  },
}));
