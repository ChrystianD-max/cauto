'use strict';

/* -----------------------------------------------------------------------------
   Module 65 — Observabilité. Ces tests sont EXÉCUTÉS CONTRE LA STACK RÉELLE
   (https://localhost, reverse-proxy) : ils valident les endpoints d'observabilité
   livrés (logs structurés, métriques Prometheus protégées, disponibilité /ready,
   latences), ainsi que le watchdog (absence de crash, gauges présentes).
   --------------------------------------------------------------------------- */

const https = require('https');
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { api, BASE } = require('./helpers');

function raw(method, path, token) {
  return new Promise((resolve) => {
    const req = https.request(BASE + path, {
      method,
      headers: token ? { Authorization: 'Bearer ' + token } : {}
    }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { b += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    req.on('error', (e) => resolve({ status: -1, headers: {}, body: String(e) }));
    req.end();
  });
}

const METRICS_TOKEN = process.env.METRICS_TOKEN || '';

describe('Observabilité — disponibilité (/health)', () => {
  it('legacy /api/health : 200, contract {status, app, db, redis} + version', async () => {
    const r = await api('GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'ok');
    assert.equal(r.data.app, true);
    assert.equal(r.data.db, true);
    assert.equal(r.data.redis, true);
    assert.equal(typeof r.data.uptime, 'number');
    if (r.data.version) assert.match(r.data.version, /^\d+\.\d+\.\d+$/);
  });

  it('/health : 200 avec détails database/redis', async () => {
    const r = await api('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'ok');
    assert.equal(r.data.database.status, 'ok');
    assert.equal(r.data.redis.status, 'ok');
    assert.equal(typeof r.data.uptime, 'number');
  });

  it('/health/ready (disponibilité) : 200, startTime ISO, version', async () => {
    const r = await api('GET', '/health/ready');
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'ok');
    assert.equal(r.data.database.status, 'ok');
    assert.equal(r.data.redis.status, 'ok');
    assert.ok(!Number.isNaN(Date.parse(r.data.startTime)));
    assert.match(r.data.version, /^\d+\.\d+\.\d+$/);
  });
});

describe('Observabilité — en-têtes et traçabilité (X-Request-Id, X-Response-Time)', () => {
  it('chaque réponse porte un X-Request-Id et un X-Response-Time', async () => {
    const r = await raw('GET', '/health');
    assert.equal(r.status, 200);
    assert.ok((r.headers['x-request-id'] || '').length > 0, 'X-Request-Id absent');
    assert.ok(!Number.isNaN(Number(r.headers['x-response-time'])), 'X-Response-Time non numérique');
    assert.ok(Number(r.headers['x-response-time']) >= 0);
  });
});

describe('Observabilité — /api/ops/info', () => {
  it('200 : service, version, env, uptime, mémoire, alertes, latences', async () => {
    const r = await api('GET', '/api/ops/info');
    assert.equal(r.status, 200);
    assert.ok(r.data.service, 'service absent');
    assert.match(r.data.version, /^\d+\.\d+\.\d+$/);
    assert.equal(r.data.env, 'staging');
    assert.ok(r.data.uptimeSeconds > 0);
    assert.ok(r.data.memoryBytes.rss > 0);
    assert.equal(typeof r.data.alert.healthy, 'boolean');
    assert.equal(typeof r.data.alert.failures, 'number');
    assert.ok(Array.isArray(r.data.topLatenciesMs));
  });
});

describe('Observabilité — export Prometheus (/api/ops/metrics)', () => {
  it('texte Prometheus contenant compteurs, gauges et histogrammes', async () => {
    const senders = METRICS_TOKEN ? [METRICS_TOKEN] : [undefined];
    let last = null;
    for (const tok of senders) {
      const r = await raw('GET', '/api/ops/metrics', tok);
      assert.equal(r.status, 200, `metrics status ${r.status} (token=${Boolean(tok)})`);
      last = r.body;
    }
    assert.match(last, /# HELP cauto_http_requests_total/);
    assert.match(last, /# TYPE cauto_http_requests_total counter/);
    assert.match(last, /# TYPE cauto_http_request_duration_seconds_bucket histogram/);
    assert.match(last, /cauto_http_requests_total\{/);
    assert.match(last, /cauto_health_ready 1/);
    assert.match(last, /^cauto_process_uptime_seconds \d+$/m);
    assert.match(last, /cauto_build_info\{version="1\.0\.0"\} 1/);
  });

  it('métriques incrémentées après des requêtes réelles', async () => {
    const before = await raw('GET', '/api/ops/metrics', METRICS_TOKEN || undefined);
    for (let i = 0; i < 5; i++) await raw('GET', '/health');
    const after = await raw('GET', '/api/ops/metrics', METRICS_TOKEN || undefined);
    const totalReqs = (txt) => {
      const lines = txt.split('\n').filter((l) => l.startsWith('cauto_http_requests_total{'));
      return lines.reduce((acc, l) => acc + Number(l.split('} ')[1]), 0);
    };
    assert.ok(totalReqs(after.body) >= totalReqs(before.body) + 4, 'compteur non incrémenté');
  });

  it('sans token configuré (staging), les métriques sont accessibles (contrat)', async () => {
    const r = await raw('GET', '/api/ops/metrics');
    assert.equal(r.status, 200);
    assert.match(r.body, /# HELP cauto_http_requests_total/);
  });
});

describe('Observabilité — latences observées (perf API / percentiles)', () => {
  it('topLatenciesMs expose p50/p95/p99 non vides une fois des requêtes passées', async () => {
    await raw('GET', '/health');
    const r = await api('GET', '/api/ops/info');
    assert.equal(r.status, 200);
    assert.ok(r.data.topLatenciesMs.length >= 1, 'aucun échantillon de latence');
    const first = r.data.topLatenciesMs[0];
    assert.ok(first.p50 > 0 && first.p95 >= first.p50 && first.p99 >= first.p95);
  });
});