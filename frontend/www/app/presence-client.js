// frontend/www/app/presence-client.js
// Frontend Presence + Cursors + Awareness Client (Socket.io)

let io = null;
try { const m = await import('https://cdn.socket.io/4.7.5/socket.io.esm.min.js'); io = m.io; } catch(e) { console.warn('[presence] CDN socket.io indisponible'); }

const PRESENCE_URL = '/presence';
const COLLAB_URL = '/collab';

class PresenceClient {
  constructor(userId, userName, userRole) {
    this.disabled = !io;
    this.userId = userId; this.userName = userName; this.userRole = userRole;
    this.presenceSocket = null; this.collabSocket = null;
    this.listeners = new Map(); this.currentModule = null;
    this.cursors = new Map(); this.onlineUsers = new Map(); this.typingUsers = new Map();
  }
  connect() {
    if (this.disabled || !io) return;
    this.presenceSocket = io(PRESENCE_URL, {
      auth: { userId: this.userId, userName: this.userName, userRole: this.userRole, route: location.hash }
    });

    this.presenceSocket.on('connect', () => {
      this.emit('connected');
    });

    this.presenceSocket.on('user:joined', (user) => {
      this.onlineUsers.set(user.userId, user);
      this.emit('user:joined', user);
    });

    this.presenceSocket.on('user:left', (data) => {
      this.onlineUsers.delete(data.userId);
      this.emit('user:left', data);
    });

    this.presenceSocket.on('user:route', (data) => {
      const user = this.onlineUsers.get(data.userId);
      if (user) { user.currentRoute = data.route; this.emit('user:route', data); }
    });

    this.presenceSocket.on('user:typing', (data) => {
      if (!this.typingUsers.has(data.moduleId)) this.typingUsers.set(data.moduleId, new Set());
      this.typingUsers.get(data.moduleId).add(data.userId);
      this.emit('typing:start', data);
    });

    this.presenceSocket.on('user:typing:stop', (data) => {
      const set = this.typingUsers.get(data.moduleId);
      if (set) { set.delete(data.userId); this.emit('typing:stop', data); }
    });

    this.presenceSocket.on('user:joined:module', (data) => {
      this.emit('module:user:joined', data);
    });

    this.presenceSocket.on('user:left:module', (data) => {
      this.emit('module:user:left', data);
    });

    this.presenceSocket.on('cursor:move', (data) => {
      this.cursors.set(data.userId, { x: data.x, y: data.y, selection: data.selection, name: data.userName, color: this.hashColor(data.userId) });
      this.emit('cursor:move', data);
    });

    this.presenceSocket.on('disconnect', () => {
      this.emit('disconnected');
    });

    // Heartbeat
    setInterval(() => {
      if (this.presenceSocket?.connected) this.presenceSocket.emit('heartbeat');
    }, 30000);

    // Route changes
    window.addEventListener('hashchange', () => {
      if (this.presenceSocket?.connected) {
        this.presenceSocket.emit('route:change', location.hash);
      }
    });
  }

  // Module collaboration
  joinModule(moduleId) {
    if (this.currentModule === moduleId) return;
    if (this.currentModule) this.leaveModule(this.currentModule);
    this.currentModule = moduleId;

    this.collabSocket = io(COLLAB_URL, {
      query: { moduleId },
      auth: { userId: this.userId, userName: this.userName }
    });

    this.collabSocket.on('connect', () => {
      this.emit('collab:connected');
    });

    this.collabSocket.on('awareness:update', (states) => {
      states.forEach((s) => this.emit('awareness:update', s));
    });

    this.collabSocket.on('doc:update', (update) => {
      this.emit('doc:update', new Uint8Array(update));
    });

    this.collabSocket.on('doc:sync', (state) => {
      this.emit('doc:sync', new Uint8Array(state));
    });

    this.presenceSocket.emit('module:join', moduleId);
  }

  leaveModule(moduleId) {
    if (this.currentModule === moduleId) {
      this.presenceSocket?.emit('module:leave', moduleId);
      this.collabSocket?.disconnect();
      this.collabSocket = null;
      this.currentModule = null;
    }
  }

  // Cursor
  moveCursor(x, y, selection = null) {
    if (this.presenceSocket?.connected && this.currentModule) {
      this.presenceSocket.emit('cursor:move', { moduleId: this.currentModule, x, y, selection });
    }
  }

  // Typing
  startTyping(moduleId) {
    this.presenceSocket?.emit('typing:start', { moduleId });
  }
  stopTyping(moduleId) {
    this.presenceSocket?.emit('typing:stop', { moduleId });
  }

  // Yjs doc sync
  sendDocUpdate(update) {
    this.collabSocket?.emit('doc:update', Array.from(update));
  }
  requestSync() {
    this.collabSocket?.emit('doc:sync');
  }

  // Event system
  on(event, cb) { if (!this.listeners.has(event)) this.listeners.set(event, []); this.listeners.get(event).push(cb); }
  off(event, cb) { if (!this.listeners.has(event)) return; this.listeners.set(event, this.listeners.get(event).filter(cb => cb !== cb)); }
  emit(event, data) { this.listeners.get(event)?.forEach(cb => cb(data)); }

  // Getters
  getOnlineUsers() { return Array.from(this.onlineUsers.values()); }
  getCursors() { return Array.from(this.cursors.entries()); }
  isTyping(moduleId, userId) { return this.typingUsers.get(moduleId)?.has(userId); }

  hashColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
  }

  disconnect() {
    this.presenceSocket?.disconnect();
    this.collabSocket?.disconnect();
  }
}

// Singleton factory
let instance = null;
export function initPresence(userId, userName, userRole) {
  if (!instance) instance = new PresenceClient(userId, userName, userRole);
  instance.connect();
  return instance;
}
export function getPresence() { return instance; }

export default { initPresence, getPresence };