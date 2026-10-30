// Skyline service worker (DECISIONS.md D64): the game keeps working offline after a first visit.
// - Pages: network first, the cached app shell when offline (every route is the same SPA page).
// - /assets/*: Vite's hashed files never change, so cache first.
// - Other files (audio, icons, manifest): the cached copy at once, refreshed in the background.
// - /api/* (rooms, WebSockets) and other origins are never touched.
const CACHE = 'skyline-v1'
const SHELL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([SHELL, '/manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function store(request, response) {
  if (response.ok) {
    const copy = response.clone()
    void caches.open(CACHE).then((cache) => cache.put(request, copy))
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/'))
    return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => store(SHELL, response))
        .catch(() => caches.match(SHELL).then((hit) => hit ?? Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit ?? fetch(request).then((r) => store(request, r))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request)
        .then((r) => store(request, r))
        .catch(() => hit ?? Response.error())
      return hit ?? fresh
    }),
  )
})
