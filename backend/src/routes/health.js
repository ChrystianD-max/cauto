const express = require('express');
const db = require('../db');

// Module 53 — Health check. Vérifie la connectivité réelle (db + redis).
// Forme de réponse : { status, database, redis } (ok | decomposed states).
// Module 65 — Observabilité : /ready (disponibilité), uptime, version, gauges.

const pkgVersion = (() => {
  try { return require('../../package.json').version; } catch { return 'unknown'; }
})();

async function checkDb() {
  try {
    const t0 = Date.now();
    await db.query('SELECT 1');
    return { status: 'ok', latencyMs: Date.now() - t0 };
  } catch {
    return { status: 'error' };
  }
}

async function checkRedis() {
  try {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      retryStrategy: () => null
    });
    const t0 = Date.now();
    const pong = await redis.ping();
    const latencyMs = Date.now() - t0;
    redis.disconnect();
    return pong === 'PONG' ? { status: 'ok', latencyMs } : { status: 'error' };
  } catch {
    return 'error';
  }
}

const router = express.Router();

router.get('/', async (_req, res) => {
  const database = await checkDb();
  const redis = await checkRedis();
  const dbOk = database.status === 'ok';
  const redisOk = redis.status === 'ok';
  const status = dbOk && redisOk ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({ status, database, redis, uptime: process.uptime(), version: pkgVersion });
});

router.get('/ready', async (_req, res) => {
  const database = await checkDb();
  const redis = await checkRedis();
  const dbOk = database.status === 'ok';
  const redisOk = redis.status === 'ok';
  const status = dbOk && redisOk ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    database, redis,
    uptime: process.uptime(),
    startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    version: pkgVersion
  });
});

router.get('/database', async (_req, res) => {
  const database = await checkDb();
  res.status(database.status === 'ok' ? 200 : 503).json({ status: database.status === 'ok' ? 'ok' : 'degraded', database });
});

router.get('/redis', async (_req, res) => {
  const redis = await checkRedis();
  res.status(redis.status === 'ok' ? 200 : 503).json({ status: redis.status === 'ok' ? 'ok' : 'degraded', redis });
});

// Compat : ancien agrégat /api/health ({status, app, db, redis}) — contract inchangé.
const legacy = express.Router();
legacy.get('/', async (_req, res) => {
  const out = { status: 'ok', app: true, db: false, redis: false, uptime: process.uptime(), version: pkgVersion };
  try {
    await db.query('SELECT 1');
    out.db = true;
  } catch { /* ignore */ }
  try {
    const Redis = require('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
      maxRetriesPerRequest: 1, connectTimeout: 1500, retryStrategy: () => null
    });
    out.redis = (await redis.ping()) === 'PONG';
    redis.disconnect();
  } catch { /* ignore */ }
  if (!out.db || !out.redis) return res.status(503).json({ ...out, status: 'degraded' });
  res.json(out);
});

module.exports = router;
module.exports.legacy = legacy;
module.exports.checkDb = checkDb;
module.exports.checkRedis = checkRedis;
module.exports.readyInfo = async () => {
  const database = await checkDb();
  const redis = await checkRedis();
  return {
    status: database.status === 'ok' && redis.status === 'ok' ? 'ok' : 'degraded',
    database, redis,
    uptime: process.uptime(),
    version: pkgVersion
  };
};