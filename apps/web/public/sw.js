// Skyline service worker (DECISIONS.md D64): the game keeps working offline after a first visit.
// - Pages: network first, the cached app shell when offline (every route is the same SPA page).
// - /assets/*: Vite's hashed files never change, so cache first.
// - Music (/audio/music/*): streamed from the network until a full copy is cached (fetched once in
//   the background), then served from the cache, including the byte ranges audio elements ask for.
// - Other files (sound pack, icons, manifest): the cached copy at once, refreshed in the background.
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
  // 206 partial responses cannot be cached.
  if (response.status === 200) {
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

  if (url.pathname.startsWith('/audio/music/')) {
    event.respondWith(music(request, url.pathname))
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

/** Tracks whose full copy is being fetched, so a burst of range requests fetches each once. */
const filling = new Set()

async function music(request, key) {
  const cache = await caches.open(CACHE)
  const full = await cache.match(key)
  if (!full) {
    if (!filling.has(key)) {
      filling.add(key)
      fetch(key)
        .then((r) => (r.status === 200 ? cache.put(key, r) : undefined))
        .catch(() => {})
        .finally(() => filling.delete(key))
    }
    return fetch(request)
  }
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (!range) return full
  const body = await full.arrayBuffer()
  const size = body.byteLength
  let start = range[1] ? Number(range[1]) : size - Number(range[2])
  let end = range[1] && range[2] ? Number(range[2]) : size - 1
  start = Math.max(0, start)
  end = Math.min(size - 1, end)
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') ?? 'audio/mpeg',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  })
}
