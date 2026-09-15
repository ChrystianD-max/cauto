// frontend/www/app/offline-db.js
// IndexedDB offline storage via Dexie (chargement CDN optionnel)

let Dexie = null;
try { const m = await import('https://esm.run/dexie@3.2.4'); Dexie = m.default || m; } catch(e) { console.warn('[offline] Dexie CDN indisponible, mode lecture seule'); }

export const offlineDB = Dexie ? new Dexie('cauto-offline') : null;

if (offlineDB) {
offlineDB.version(1).stores({
  messages: '++id, conversationId, content, timestamp, synced, localId',
  conversations: '++id, title, updatedAt, unreadCount',
  modules: '++id, slug, title, content, updatedAt, synced',
  professionals: '++id, slug, name, specialty, data, updatedAt, synced',
  innovations: '++id, slug, title, description, data, updatedAt, synced',
  mutations: '++id, type, payload, timestamp, retries',
  userProfile: 'id, name, email, role, avatar, updatedAt'
});
}

// Helpers pour l'app
export const offline = {
  // Messages
  async saveMessage(msg) {
    return offlineDB.messages.add({ ...msg, synced: false, localId: crypto.randomUUID() });
  },
  async getMessages(conversationId) {
    return offlineDB.messages.where('conversationId').equals(conversationId).toArray();
  },
  async markMessageSynced(localId) {
    return offlineDB.messages.where('localId').equals(localId).modify({ synced: true });
  },

  // Conversations
  async upsertConversation(conv) {
    return offlineDB.conversations.put({ ...conv, updatedAt: Date.now() });
  },
  async getConversations() {
    return offlineDB.conversations.orderBy('updatedAt').reverse().toArray();
  },

  // Modules / Pros / Innovations (cache lecture)
  async cacheList(type, items) {
    const table = offlineDB[type];
    if (!table) return;
    await table.bulkPut(items.map((i) => ({ ...i, updatedAt: Date.now(), synced: true })));
  },
  async getCachedList(type) {
    const table = offlineDB[type];
    if (!table) return [];
    return table.toArray();
  },

  // Mutations en attente (POST/PUT/DELETE hors-ligne)
  async queueMutation(type, payload) {
    return offlineDB.mutations.add({ type, payload, timestamp: Date.now(), retries: 0 });
  },
  async getPendingMutations() {
    return offlineDB.mutations.orderBy('timestamp').toArray();
  },
  async removeMutation(id) {
    return offlineDB.mutations.delete(id);
  },
  async incrementRetry(id) {
    return offlineDB.mutations.update(id, (m) => { m.retries++; });
  },

  // Profil utilisateur
  async saveProfile(profile) {
    return offlineDB.userProfile.put({ id: 'current', ...profile, updatedAt: Date.now() });
  },
  async getProfile() {
    return offlineDB.userProfile.get('current');
  },

  // Nettoyage
  async clearAll() {
    return offlineDB.transaction('rw', offlineDB.tables, () => offlineDB.tables.forEach((t) => t.clear()));
  }
};

// Ecoute les messages du SW pour maj auto
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'API_UPDATED' && event.data.url) {
      // Optionnel : notifier l'app pour refresh ciblé
      window.dispatchEvent(new CustomEvent('cauto:api-updated', { detail: event.data }));
    }
    if (event.data?.type === 'SYNC_NOW') {
      window.dispatchEvent(new CustomEvent('cauto:sync-now'));
    }
  });
}

export default offlineDB;