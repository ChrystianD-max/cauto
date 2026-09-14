const CACHE_NAME = 'cauto-pwa-v11';
const STATIC_ASSETS = [
  '/app/',
  '/app/index.html',
  '/app/app-v8.js',
  '/app/views-modules-v2.js',
  '/app/views-professionals-v8.js',
  '/app/views-innovations.js',
  '/app/views-chat.js',
  '/app/views-admin.js',
  '/app/app-i18n.js',
  '/app/pwa.js',
  '/app/icons/logo-app.png',
  '/app/icons/icon-192.png',
  '/app/icons/icon-512.png',
  '/app/manifest.json'
];

const API_CACHE_NAME = 'cauto-api-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== 'cauto-api-v1').map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    event.respondWith(staleWhileRevalidateAPI(request));
    return;
  }

  if (STATIC_ASSETS.some((a) => url.pathname.endsWith(a.replace('/app/', '')))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Hors ligne', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match('/app/index.html');
  }
}

async function staleWhileRevalidateAPI(request) {
  const cache = await caches.open('cauto-api-v1');
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        self.clients.matchAll().then((clients) =>
          clients.forEach((c) => c.postMessage({ type: 'API_UPDATED', url: request.url, data: response.clone() }))
        );
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-mutations') {
    event.waitUntil(syncMutations());
  }
});

async function syncMutations() {
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: 'SYNC_NOW' }));
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/app/icons/logo-app.png',
      badge: '/app/icons/logo-app.png',
      data: data.url || '/app/',
      actions: [{ action: 'open', title: 'Ouvrir' }]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data));
});