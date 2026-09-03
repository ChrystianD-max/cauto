'use strict';

/* =============================================================================
   C-AUTO — Observabilité (module 65) : routes /api/ops
   -----------------------------------------------------------------------------
     GET /api/ops/info    → état détaillé (version, uptime, mémoire, alertes,
                            latences p50/p95/p99 par route) — JSON, public.
     GET /api/ops/metrics → texte Prometheus, PROTÉGÉ par Bearer METRICS_TOKEN
                            (en production un token est obligatoire sinon 404).
   =========================================================================== */

const express = require('express');
const config = require('../config');
const { current: alertState } = require('../observability/alerts');
const { errorBody } = require('../utils/errorResponse');

const router = express.Router();
const enabled = config.observability.metricsEnabled;
const token = config.observability.metricsToken || '';

function authorize(req, res) {
  if (!enabled) { res.status(404).json(errorBody(404, 'Introuvable', 'NOT_FOUND')); return false; }
  if (token) {
    const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (given !== token) { res.status(401).json(errorBody(401, 'Non autorisé', 'METRICS_UNAUTHORIZED')); return false; }
  } else if (config.isProduction) {
    // Prod : ne JAMAIS exposer les métriques sans token.
    res.status(404).json(errorBody(404, 'Introuvable', 'NOT_FOUND'));
    return false;
  }
  return true;
}

router.get('/info', (_req, res) => {
  const mem = process.memoryUsage();
  res.json({
    service: config.observability.serviceName,
    version: config.observability.version,
    env: config.env,
    pid: process.pid,
    hostname: process.env.HOSTNAME || require('os').hostname(),
    startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    runtime: `node ${process.version}`,
    memoryBytes: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
    topLatenciesMs: config.observability.metricsEnabled
      ? require('../observability/index').metrics.percentiles('http_request_duration_seconds').slice(0, 10)
      : [],
    alert: alertState()
  });
});

router.get('/metrics', (req, res) => {
  if (!authorize(req, res)) return;
  const { metrics } = require('../observability/index');
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    .send(metrics.formatPrometheus());
});

module.exports = router;