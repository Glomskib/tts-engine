// FlashFlow service worker — intentionally MINIMAL.
//
// History: a previous SW cached too aggressively and served stale app pages,
// so it was replaced with a self-destruct kill-switch. This version exists
// only to (a) satisfy PWA installability on Android/Chrome and (b) show a
// branded offline page when the network is down. It NEVER caches API routes,
// pages, or assets — every request except the offline fallback goes straight
// to the network, so a deploy can never be masked by a stale cache again.
//
// Bump CACHE_VERSION if offline.html or the precached icons change.
const CACHE_VERSION = 'ffai-offline-v1';
const OFFLINE_URL = '/offline.html';
// Precache only the offline page + the icons it shows. Nothing else.
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE))
  );
  // Activate immediately — safe because we don't cache app content, so there
  // is no "old cache vs new code" mismatch to worry about.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Drop caches from older SW versions (including the old kill-switch era).
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only intercept top-level page navigations. API calls, media, JS/CSS,
  // uploads etc. are deliberately left to the browser's default networking —
  // the app is highly dynamic and a stale cache would be worse than no cache.
  if (request.mode !== 'navigate' || request.method !== 'GET') return;

  event.respondWith(
    // Network-first: always try the real page; fall back to the offline page
    // only when the fetch itself fails (i.e. genuinely no connectivity).
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || Response.error())
    )
  );
});
