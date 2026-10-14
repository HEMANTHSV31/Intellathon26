const CACHE_NAME = 'dr-screening-rural-v1'
const ASSETS_TO_PRECACHE = [
  '/',
  '/index.html',
  '/tf.min.js',
  '/favicon.svg',
  '/icons.svg',
  '/models/model.json'
]

// Install Service Worker and cache core shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching core assets for rural offline resilience')
      return cache.addAll(ASSETS_TO_PRECACHE).catch((err) => {
        console.warn('[ServiceWorker] Some precache assets were skipped:', err)
      })
    })
  )
  self.skipWaiting()
})

// Activate and cleanup older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key)
            return caches.delete(key)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// Fetch interceptor: network first with offline cache fallback
self.addEventListener('fetch', (event) => {
  // Let browser handle non-GET or cross-origin requests directly
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return

  // For app assets & static files: stale-while-revalidate or cache fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
          return networkResponse
        })
        .catch(() => {
          // When offline, return cached version or index.html for navigation
          if (cachedResponse) return cachedResponse
          if (event.request.mode === 'navigate') {
            return caches.match('/') || caches.match('/index.html')
          }
        })

      return cachedResponse || fetchPromise
    })
  )
})
