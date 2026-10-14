const CACHE_NAME = 'mixboard-v4';
const OFFLINE_CACHE = 'mixboard-offline';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== OFFLINE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Audio streams → cache-first (instant if cached offline)
  if (url.pathname.startsWith('/api/audio/stream/') ||
      url.pathname.startsWith('/api/audio/stem-by-type/')) {
    event.respondWith(
      caches.open(OFFLINE_CACHE).then(cache =>
        cache.match(new Request(url.pathname), { ignoreSearch: true })
          .then(cached => cached || fetch(event.request))
      )
    );
    return;
  }

  // Session data → network-first, fallback to offline cache
  if (url.pathname.match(/^\/api\/sessions\/\d+$/)) {
    event.respondWith(
      fetch(event.request)
        .then(response => response)
        .catch(() =>
          caches.open(OFFLINE_CACHE).then(cache =>
            cache.match(new Request(url.pathname))
          )
        )
    );
    return;
  }

  // All other API/WebSocket requests → pass through (no cache)
  if (url.pathname.startsWith('/api/') || url.pathname === '/ws') {
    return;
  }

  // For navigation requests, try network first, fall back to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('/', clone));
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // For assets (JS, CSS with hash in filename): network first, cache fallback
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});
