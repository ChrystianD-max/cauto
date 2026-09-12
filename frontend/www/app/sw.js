/* C-AUTO PWA — Service Worker
   Stratégie : pré-cache des éléments essentiels, network-first sur les navigations
   (shell HTML toujours frais), cache-first + rafraîchissement en arrière-plan sur
   les assets (versionnés ?v=), et rejeu de la file d'attente locale à la
   reconnexion (event 'sync' -> 'cauto-flush'). */
'use strict';

const VERSION = 'cauto-pwa-v34';
const CORE = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './vendor/lucide.min.js?v=1.0',
  './styles.css?v=10.24',
  './design-system.css?v=1.1',
  './glass-theme.css?v=2.6',
  './premium.css?v=1.1',
  './admin-theme.css?v=1.0',
  './app-i18n.js?v=1.1',
  './ux-states.js?v=1.0',
  './app-v8.js?v=12.7',
  './views-admin.js?v=2.4',
  './views-professionals-v8.js?v=1.16',
  './views-modules-v2.js?v=1.6',
  './views-chat.js?v=2.1',
  './views-innovations.js?v=1.0',
  './pwa.js?v=1.1',
  './assets/auth-bg.jpg'
];

/* NOTE : quand les versions ?v= des assets de index.html changent, incrémenter
   VERSION et mettre à jour CORE ci-dessus. */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  /* API : uniquement le réseau — jamais mise en cache par le SW */
  if (url.pathname.startsWith('/api/')) return;

  /* Navigation (documents HTML) : network-first avec repli coupé par un
     délai de garde (5 s) sur le shell pré-caché, puis la page hors ligne. */
  if (request.mode === 'navigate') {
    event.respondWith(
      Promise.race([
        fetch(request),
        new Promise((_, reject) => setTimeout(() => reject(new Error('nav-timeout')), 5000))
      ])
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then((hit) => hit || caches.match('./offline.html'))
        )
    );
    return;
  }

  /* Assets (js/css/fonts/images/icônes/manifest) : cache-first puis mise à jour
     en arrière-plan. */
  event.respondWith(
    caches.match(request).then((hit) => {
      const fetched = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => hit);
      return hit || fetched;
    })
  );
});

/* Synchronisation en arrière-plan (Background Sync) : notifie la page courante
   pour rejouer les mutations mises en file d'attente locale. */
self.addEventListener('sync', (event) => {
  if (event.tag === 'cauto-sync') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) =>
        Promise.all(clients.map((client) => client.postMessage({ type: 'cauto-flush' })))
      )
    );
  }
});

/* Drainage de file déclenché par la page */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'cauto-flush') {
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) =>
      clients.forEach((client) => client.postMessage({ type: 'cauto-flush' }))
    );
  }
});

/* --- Notifications push (module 67) --- */
self.addEventListener('push', (event) => {
  let data = { title: 'C-AUTO', body: '', url: '/app' };
  if (event.data) {
    try { data = Object.assign(data, event.data.json()); } catch (_) { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'C-AUTO', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      vibrate: [120, 60, 120],
      data: { url: data.url || '/app' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/app';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          try { client.navigate(url); } catch (_) { /* déjà sur une autre page */ }
          return client.focus();
        }
      }
      return self.clients.openWindow(url).catch(() => undefined);
    })
  );
});
