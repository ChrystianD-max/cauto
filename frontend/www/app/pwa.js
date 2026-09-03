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
      }).catch(function () {});
    });
    navigator.serviceWorker.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'cauto-flush') flushQueue();
    });
  }
})();