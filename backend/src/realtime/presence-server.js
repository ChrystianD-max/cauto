// backend/src/realtime/presence-server.js
// Real-time Presence + Cursors + Awareness (Socket.io + Redis + Yjs awareness)

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');

let io = null;
let pubClient = null;
let subClient = null;

function initPresenceServer(httpServer) {
  // Redis clients for scaling
  pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
  subClient = pubClient.duplicate();
  
  pubClient.connect().catch(console.error);
  subClient.connect().catch(console.error);

  // Socket.io server
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGINS?.split(',') || '*', methods: ['GET', 'POST'] },
    adapter: createAdapter(pubClient, subClient)
  });

  // Namespaces
  const presenceNs = io.of('/presence');
  const collabNs = io.of('/collab');

  // ===== PRESENCE (who's online, where) =====
  presenceNs.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId;
    const userName = socket.handshake.auth?.userName || 'Anonyme';
    const userRole = socket.handshake.auth?.userRole || 'user';
    
    if (!userId) return socket.disconnect();

    // Join user's personal room + global presence
    socket.join(`user:${userId}`);
    socket.join('presence:global');

    // Track user presence
    const presenceData = {
      userId,
      userName,
      userRole,
      currentRoute: socket.handshake.auth?.route || '/',
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
      presenceData.currentRoute = route;
      presenceData.lastSeen = Date.now();
      pubClient.hSet('presence:users', userId, JSON.stringify(presenceData));
      presenceNs.to('presence:global').emit('user:route', { userId, route });
    });

    // Heartbeat
    socket.on('heartbeat', () => {
      presenceData.lastSeen = Date.now();
      pubClient.hSet('presence:users', userId, JSON.stringify(presenceData));
    });

    // Typing indicator
    socket.on('typing:start', (data) => {
      socket.to(`module:${data.moduleId}`).emit('user:typing', { userId, userName, moduleId: data.moduleId });
    });
    socket.on('typing:stop', (data) => {
      socket.to(`module:${data.moduleId}`).emit('user:typing:stop', { userId, moduleId: data.moduleId });
    });

    // Join module room for cursors/presence
    socket.on('module:join', (moduleId) => {
      socket.join(`module:${moduleId}`);
      socket.to(`module:${moduleId}`).emit('user:joined:module', { userId, userName, moduleId });
    });
    socket.on('module:leave', (moduleId) => {
      socket.leave(`module:${moduleId}`);
      socket.to(`module:${moduleId}`).emit('user:left:module', { userId, moduleId });
    });

    // Cursor position
    socket.on('cursor:move', (data) => {
      socket.to(`module:${data.moduleId}`).emit('cursor:move', {
        userId, userName, x: data.x, y: data.y, selection: data.selection
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
    const moduleId = socket.handshake.query.moduleId;
    const userId = socket.handshake.auth?.userId;
    const userName = socket.handshake.auth?.userName || 'Anonyme';

    if (!moduleId || !userId) return socket.disconnect();

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