// frontend/www/app/push-manager.js
// Web Push Notifications — gestion abonnement + UI (VAPID public key requise côté backend)

const VAPID_PUBLIC_KEY = 'BAvK9xJ5Q7vR2mN8pL3wE6yU1oI4aH7cD0eF9gG3hJ6kL2mN5oP8qR1sT4uV7wX0yZ3'; // REMPLACE par ta vraie clé publique VAPID

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

class PushManager {
  constructor() {
    this.subscription = null;
    this.isSupported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.permission = this.isSupported ? Notification.permission : 'denied';
  }

  async init() {
    if (!this.isSupported) {
      console.warn('[push] Non supporté');
      return;
    }
    this.permission = await Notification.requestPermission();
    if (this.permission === 'granted') {
      await this.subscribe();
    }
    this.listenForPermissionChanges();
  }

  async subscribe() {
    if (!this.isSupported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      this.subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      await this.sendSubscriptionToServer(this.subscription);
      console.log('[push] Abonné:', this.subscription.endpoint);
      return this.subscription;
    } catch (e) {
      console.error('[push] Échec abonnement:', e);
    }
  }

  async unsubscribe() {
    if (!this.subscription) return;
    try {
      await this.subscription.unsubscribe();
      await this.deleteSubscriptionFromServer(this.subscription);
      this.subscription = null;
      console.log('[push] Désabonné');
    } catch (e) {
      console.error('[push] Échec désabonnement:', e);
    }
  }

  async sendSubscriptionToServer(sub) {
    try {
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
        body: JSON.stringify(sub)
      });
    } catch (e) {
      console.warn('[push] Échec envoi abonnement au serveur:', e);
    }
  }

  async deleteSubscriptionFromServer(sub) {
    try {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
        body: JSON.stringify({ endpoint: sub.endpoint })
      });
    } catch (e) {
      console.warn('[push] Échec suppression abonnement serveur:', e);
    }
  }

  listenForPermissionChanges() {
    if (!this.isSupported) return;
    setInterval(async () => {
      const perm = Notification.permission;
      if (perm !== this.permission) {
        this.permission = perm;
        if (perm === 'granted' && !this.subscription) await this.subscribe();
        else if (perm !== 'granted' && this.subscription) await this.unsubscribe();
      }
    }, 30000);
  }

  // UI : bouton toggle dans le profil/paramètres
  renderToggleButton(container) {
    const btn = document.createElement('button');
    btn.className = 'push-toggle';
    btn.innerHTML = this.subscription
      ? '<i data-lucide="bell-off"></i> Désactiver notifications'
      : '<i data-lucide="bell"></i> Activer notifications';
    btn.onclick = async () => {
      if (this.subscription) await this.unsubscribe();
      else await this.subscribe();
      this.renderToggleButton(container);
      if (window.lucide) window.lucide.createIcons();
    };
    container.appendChild(btn);
    if (window.lucide) window.lucide.createIcons();
  }
}

export const pushManager = new PushManager();
window.pushManager = pushManager;

// Auto-init
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    pushManager.init().catch(console.error);
  });
}

export default pushManager;