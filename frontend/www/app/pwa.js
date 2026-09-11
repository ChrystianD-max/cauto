/* C-AUTO PWA — enregistrement du service worker, installation de l'application
   et synchronisation future de la file d'attente hors ligne ('mq.queue'). */
'use strict';

(function () {
  var QUEUE_KEY = 'mq.queue';
  var SW_PATH = '/app/sw.js';

  function swSupported() {
    return 'serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  }

  function pendingQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveQueue(queue) { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }

  /* Rejoue les mutations hors ligne dès que la connexion revient.
     Les éléments sont de la forme { path, method, body } (offlineQueue existant). */
  async function flushQueue() {
    var queue = pendingQueue();
    if (!queue.length || !navigator.onLine) return;
    var token = (window.S && window.S.token) || localStorage.getItem('token') || '';
    if (!token) return;
    var base = location.origin;
    var remaining = [];
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      try {
        var res = await fetch(base + '/api' + item.path, {
          method: item.method || 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: item.body ? JSON.stringify(item.body) : undefined
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      } catch (err) {
        remaining.push(item);
      }
    }
    saveQueue(remaining);
    if (!remaining.length && window.toast) window.toast('Saisies hors ligne synchronisées', 'success');
  }

  function registerBackgroundSync() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.sync && reg.sync.register) {
        reg.sync.register('cauto-sync').catch(function () {});
      }
    }).catch(function () {});
  }

  /* --- Installation de l'application --- */
  var installPrompt = null;
  var installHost = document.getElementById('pwa-install-host');
  function showInstall() {
    if (installHost) installHost.classList.remove('hidden');
  }
  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    installPrompt = event;
    showInstall();
  });
  var installBtn = document.getElementById('btn-pwa-install');
  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt.userChoice.then(function () {
        installPrompt = null;
        if (installHost) installHost.classList.add('hidden');
      });
    });
  }
  window.addEventListener('appinstalled', function () {
    if (installHost) installHost.classList.add('hidden');
  });

/* API de synchronisation future pour les modules hors ligne */
  window.cautoQueueAdd = function (item) {
    var q = pendingQueue(); q.push(item); saveQueue(q); registerBackgroundSync();
    if (window.toast) window.toast('Enregistré — synchronisation au retour de la connexion', 'warn');
  };
  window.cautoSyncNow = flushQueue;

  window.addEventListener('online', flushQueue);

  /* --- Enregistrement --- */
  if (swSupported()) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(SW_PATH).then(function (reg) {
        reg.update().catch(function () {});
        if (pendingQueue().length) registerBackgroundSync();
        resyncPush();
      }).catch(function () {});
    });
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'cauto-flush') flushQueue();
    });
  }

  /* --- Notifications push (module 67) --- */
  var PUSH_KEY = 'push.vapid';
  var PUSH_ENDPOINT_KEY = 'push.active';

  function urlBase64ToUint8Array(base64) {
    var pad = base64.replace(/=+$/, '');
    var raw = atob(pad);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  function binaryKey(ab) {
    var bytes = new Uint8Array(ab);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function pushVapidPublic() {
    try { return JSON.parse(localStorage.getItem(PUSH_KEY) || 'null'); } catch (e) { return null; }
  }

  async function fetchVapidPublic() {
    var cached = pushVapidPublic();
    if (cached && cached.k) return cached.k;
    try {
      var res = await fetch(location.origin + '/api/config');
      if (!res.ok) return cached ? cached.k : null;
      var j = await res.json();
      var pk = j && j.integrations && j.integrations.pushVapidPublicKey;
      if (pk) {
        try { localStorage.setItem(PUSH_KEY, JSON.stringify({ k: pk, t: Date.now() })); } catch (e) {}
        return pk;
      }
    } catch (e) {}
    return cached ? cached.k : null;
  }

  function authToken() {
    return (window.S && window.S.token) || localStorage.getItem('token') || '';
  }

  async function sendSubscriptionToServer(sub) {
    var token = authToken();
    if (!token) return false;
    try {
      var res = await fetch(location.origin + '/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: { p256dh: binaryKey(sub.getKey('p256dh')), auth: binaryKey(sub.getKey('auth')) },
          userAgent: (navigator.userAgent || '').slice(0, 400)
        })
      });
      if (res.ok) {
        try { localStorage.setItem(PUSH_ENDPOINT_KEY, sub.endpoint); } catch (e) {}
        return true;
      }
    } catch (e) {}
    return false;
  }

  window.cautoPush = {
    enabled: false,
    async enable() {
      if (!('Notification' in window) || !('PushManager' in window)) return { ok: false, reason: 'unsupported' };
      if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
      if (!authToken()) return { ok: false, reason: 'auth' };
      var reg = await navigator.serviceWorker.ready;
      var key = await fetchVapidPublic();
      if (!key) return { ok: false, reason: 'vapid' };
      try {
        if (window.Notification && Notification.requestPermission) await Notification.requestPermission();
      } catch (e) {}
      if (Notification.permission !== 'granted') return { ok: false, reason: 'permission' };
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key)
        });
      }
      var ok = await sendSubscriptionToServer(sub);
      window.cautoPush.enabled = ok;
      return { ok: ok };
    },
    async disable() {
      try {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        var token = authToken();
        if (sub) {
          if (token) {
            try { await fetch(location.origin + '/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ endpoint: sub.endpoint }) }); } catch (e) {}
          }
          await sub.unsubscribe().catch(function () {});
        }
      } catch (e) {}
      try { localStorage.removeItem(PUSH_ENDPOINT_KEY); } catch (e) {}
      window.cautoPush.enabled = false;
      return { ok: true };
    }
  };

  /* Reconnexion à chaque login ; reprise automatique si la permission est déjà
     accordée et l'appareil de la même origine (endpoint identique = pas de spam). */
  var resyncPush = async function () {
    if (!('serviceWorker' in navigator)) return;
    if (!('Notification' in window) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!authToken()) return;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        var key = await fetchVapidPublic();
        if (!key) return;
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      }
      try {
        if (localStorage.getItem(PUSH_ENDPOINT_KEY) === sub.endpoint) return;
      } catch (e) {}
      var ok = await sendSubscriptionToServer(sub);
      window.cautoPush.enabled = ok;
    } catch (e) {}
  };
  window.cautoResyncPush = resyncPush;
})();