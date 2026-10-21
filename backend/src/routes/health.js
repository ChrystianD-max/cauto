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
  // Redis est une dependance OPTIONNELLE : l'application degrade proprement
  // (rate limiter en memoire, Socket.io en mono-instance) quand il n'est pas
  // configure. Son absence ne doit donc pas faire echouer le health check
  // (Render s'en sert pour valider les deploiements).
  const url = String(process.env.REDIS_URL || '').trim();
  if (!url) return { status: 'disabled' };
  try {
    const Redis = require('ioredis');
    const redis = new Redis(url, {
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
  // Redis non configure = dependance optionnelle non activee : ce n'est pas
  // une degradation. Configure mais injoignable = degradation reelle.
  const redisOk = redis.status === 'ok' || redis.status === 'disabled';
  // /health = LIVENESS : le process repond-il ? C'est ce chemin que la plateforme
  // de deploiement interroge pour valider une instance. L'etat de la base est
  //rapporte dans le corps de la reponse, mais il ne doit pas faire tuer un
  // conteneur valide (sinon un incident base coupe l'acces au diagnostic).
  // La stricte disponibilite metier est verifiee par /health/ready et
  // /health/database.
  res.json({
    status: dbOk && redisOk ? 'ok' : 'degraded',
    database, redis,
    uptime: process.uptime(),
    version: pkgVersion
  });
});

router.get('/ready', async (_req, res) => {
  const database = await checkDb();
  const redis = await checkRedis();
  const dbOk = database.status === 'ok';
  const redisOk = redis.status === 'ok' || redis.status === 'disabled';
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
  const ok = redis.status === 'ok' || redis.status === 'disabled';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', redis });
});

// Compat : ancien agrégat /api/health ({status, app, db, redis}) — contract inchangé.
const legacy = express.Router();
legacy.get('/', async (_req, res) => {
  const out = { status: 'ok', app: true, db: false, redis: false, uptime: process.uptime(), version: pkgVersion };
  try {
    await db.query('SELECT 1');
    out.db = true;
  } catch { /* ignore */ }
  const redisInfo = await checkRedis();
  // Redis non configure : dependance optionnelle, ce n'est pas une degradation.
  out.redis = redisInfo.status === 'ok' || redisInfo.status === 'disabled';
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
  const redisOk = redis.status === 'ok' || redis.status === 'disabled';
  return {
    status: database.status === 'ok' && redisOk ? 'ok' : 'degraded',
    database, redis,
    uptime: process.uptime(),
    version: pkgVersion
  };
};