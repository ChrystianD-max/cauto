// backend/src/realtime/presence-server.js
// Real-time Presence + Cursors + Awareness (Socket.io + Redis + Yjs awareness)

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const jwt = require('jsonwebtoken');
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const config = require('../config');
const db = require('../db');

let io = null;
let pubClient = null;
let subClient = null;

// --- Authentification des sockets -------------------------------------------
// L'identite (id, nom, role) provient EXCLUSIVEMENT du JWT verifie et de la
// base : les valeurs envoyees par le client (handshake.auth.userId / userName
// / userRole) sont ignorees, faute de quoi n'importe quel visiteur pouvait
// se faire passer pour un autre utilisateur (usurpation d'identite).
function socketAuth() {
  return async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token || '').replace(/^Bearer\s+/i, '').trim();
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, config.jwtSecret);
      const userId = payload.sub;
      if (!userId) return next(new Error('unauthorized'));
      const user = await db
        .one('SELECT id,name,role,status FROM users WHERE id=$1', [userId])
        .catch(() => null);
      if (!user || user.status === 'SUSPENDED') return next(new Error('unauthorized'));
      socket.data.user = { id: user.id, name: user.name, role: user.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  };
}

// Identifiant de module : jeu de caracteres restreint (evite l'injection de
// cle Redis `collab:doc:<moduleId>` et la collision entre modules).
const MODULE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function initPresenceServer(httpServer) {
  // Redis clients for scaling
  pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  subClient = pubClient.duplicate();
  
  pubClient.connect().catch(console.error);
  subClient.connect().catch(console.error);

  // Socket.io server
  io = new Server(httpServer, {
    cors: { origin: config.allowedOrigins, methods: ['GET', 'POST'] },
    adapter: createAdapter(pubClient, subClient)
  });

  // Namespaces
  const presenceNs = io.of('/presence');
  const collabNs = io.of('/collab');

  presenceNs.use(socketAuth());
  collabNs.use(socketAuth());

  // ===== PRESENCE (who's online, where) =====
  presenceNs.on('connection', (socket) => {
    const userId = socket.data.user.id;
    const userName = socket.data.user.name;
    const userRole = socket.data.user.role;
    
    if (!userId) return socket.disconnect();

    // Join user's personal room + global presence
    socket.join(`user:${userId}`);
    socket.join('presence:global');

    // Track user presence
    const presenceData = {
      userId,
      userName,
      userRole,
      currentRoute: String(socket.handshake.auth?.route || '/').slice(0, 120),
      lastSeen: Date.now(),
      status: 'online'
    };

    // Store in Redis for persistence across restarts
    pubClient.hSet('presence:users', userId, JSON.stringify(presenceData));
    pubClient.sAdd('presence:online', userId);

    // Broadcast join
    presenceNs.to('presence:global').emit('user:joined', presenceData);

    // Update route
    socket.on('route:change', (route) => {
      presenceData.currentRoute = String(route || '/').slice(0, 120);
      presenceData.lastSeen = Date.now();
      pubClient.hSet('presence:users', userId, JSON.stringify(presenceData));
      presenceNs.to('presence:global').emit('user:route', { userId, route: presenceData.currentRoute });
    });

    // Heartbeat
    socket.on('heartbeat', () => {
      presenceData.lastSeen = Date.now();
      pubClient.hSet('presence:users', userId, JSON.stringify(presenceData));
    });

    // Typing indicator
    socket.on('typing:start', (data) => {
      if (!MODULE_ID_RE.test(String(data?.moduleId || ''))) return;
      socket.to(`module:${data.moduleId}`).emit('user:typing', { userId, userName, moduleId: data.moduleId });
    });
    socket.on('typing:stop', (data) => {
      if (!MODULE_ID_RE.test(String(data?.moduleId || ''))) return;
      socket.to(`module:${data.moduleId}`).emit('user:typing:stop', { userId, moduleId: data.moduleId });
    });

    // Join module room for cursors/presence
    socket.on('module:join', (moduleId) => {
      if (!MODULE_ID_RE.test(String(moduleId || ''))) return;
      socket.join(`module:${moduleId}`);
      socket.to(`module:${moduleId}`).emit('user:joined:module', { userId, userName, moduleId });
    });
    socket.on('module:leave', (moduleId) => {
      if (!MODULE_ID_RE.test(String(moduleId || ''))) return;
      socket.leave(`module:${moduleId}`);
      socket.to(`module:${moduleId}`).emit('user:left:module', { userId, moduleId });
    });

    // Cursor position
    socket.on('cursor:move', (data) => {
      if (!MODULE_ID_RE.test(String(data?.moduleId || ''))) return;
      socket.to(`module:${data.moduleId}`).emit('cursor:move', {
        userId, userName, x: Number(data.x) || 0, y: Number(data.y) || 0,
        selection: typeof data.selection === 'string' ? data.selection.slice(0, 2000) : null
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      presenceData.status = 'offline';
      presenceData.lastSeen = Date.now();
      await pubClient.hSet('presence:users', userId, JSON.stringify(presenceData));
      await pubClient.sRem('presence:online', userId);
      presenceNs.to('presence:global').emit('user:left', { userId, userName });
    });
  });

  // ===== COLLABORATION (Yjs + awareness) =====
  const docs = new Map(); // moduleId -> Y.Doc

  collabNs.on('connection', (socket) => {
    const moduleId = String(socket.handshake.query.moduleId || '').trim();
    const userId = socket.data.user.id;
    const userName = socket.data.user.name;

    if (!MODULE_ID_RE.test(moduleId) || !userId) return socket.disconnect();

    // Get or create Y.Doc for this module
    let doc = docs.get(moduleId);
    if (!doc) {
      doc = new Y.Doc();
      docs.set(moduleId, doc);
      // Persist to Redis periodically
      setInterval(() => persistDoc(moduleId, doc), 30000);
      // Load from Redis on startup
      loadDoc(moduleId, doc);
    }

    socket.join(`collab:${moduleId}`);

    // Awareness (cursors, selections, user info)
    const awareness = new WebsocketProvider(null, `collab:${moduleId}`, doc).awareness;
    awareness.setLocalState({ userId, userName, color: hashColor(userId), cursor: null, selection: null });

    // Broadcast awareness updates
    awareness.on('change', () => {
      const states = Array.from(awareness.getStates().entries())
        .filter(([id]) => id !== socket.id)
        .map(([id, state]) => ({ clientId: id, ...state }));
      socket.to(`collab:${moduleId}`).emit('awareness:update', states);
    });

    // Receive awareness from client
    socket.on('awareness:update', (states) => {
      states.forEach((s) => awareness.setLocalState(s));
    });

    // Yjs document updates
    socket.on('doc:update', (update) => {
      Y.applyUpdate(doc, new Uint8Array(update));
      socket.to(`collab:${moduleId}`).emit('doc:update', update);
    });

    socket.on('doc:sync', () => {
      const state = Y.encodeStateAsUpdate(doc);
      socket.emit('doc:sync', Array.from(state));
    });

    socket.on('disconnect', () => {
      awareness.destroy();
    });
  });

  // Persist Y.Doc to Redis
  async function persistDoc(moduleId, doc) {
    try {
      const update = Y.encodeStateAsUpdate(doc);
      await pubClient.set(`collab:doc:${moduleId}`, Buffer.from(update).toString('base64'));
    } catch (e) { console.error('[collab] persist error:', e); }
  }

  async function loadDoc(moduleId, doc) {
    try {
      const data = await pubClient.get(`collab:doc:${moduleId}`);
      if (data) {
        const update = Uint8Array.from(Buffer.from(data, 'base64'));
        Y.applyUpdate(doc, update);
      }
    } catch (e) { console.error('[collab] load error:', e); }
  }

  function hashColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
  }

  // Cleanup
  process.on('SIGTERM', async () => {
    for (const [moduleId, doc] of docs) await persistDoc(moduleId, doc);
    await pubClient.quit();
    await subClient.quit();
  });

  return { presenceNs, collabNs, io };
}

module.exports = { initPresenceServer };