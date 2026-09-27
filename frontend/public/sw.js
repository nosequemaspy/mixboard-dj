const CACHE_NAME = 'mixboard-v3';
const AUDIO_CACHE = 'mixboard-audio-v1';
const MAX_AUDIO_ENTRIES = 200;

// Only cache the app shell — API calls are always network
const APP_SHELL = [
  '/',
  '/player',
  '/remote',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== AUDIO_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Trim audio cache to MAX_AUDIO_ENTRIES (LRU: delete oldest)
async function trimAudioCache() {
  const cache = await caches.open(AUDIO_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_AUDIO_ENTRIES) {
    const toDelete = keys.slice(0, keys.length - MAX_AUDIO_ENTRIES);
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Audio streams: cache-first (instant playback after first load)
  if (url.pathname.startsWith('/api/audio/stream/') || url.pathname.startsWith('/api/audio/stem-by-type/')) {
    // Only cache full GET requests (not Range requests — those are seeks within already-loaded songs)
    if (event.request.method === 'GET' && !event.request.headers.get('range')) {
      event.respondWith(
        caches.open(AUDIO_CACHE).then(cache =>
          cache.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
              if (response.ok) {
                cache.put(event.request, response.clone());
                trimAudioCache();
              }
              return response;
            });
          })
        )
      );
      return;
    }
    // Range requests go straight to network
    return;
  }

  // Never cache other API or WebSocket requests
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') {
    return;
  }

  // For navigation requests, try network first, fall back to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // For assets (JS, CSS), use stale-while-revalidate
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetched = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
          return cached || fetched;
        })
      )
    );
    return;
  }
});
