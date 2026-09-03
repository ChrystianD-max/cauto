'use strict';

/* =============================================================================
   C-AUTO — Observabilité (module 65) : watchdog disponibilité + alertes
   -----------------------------------------------------------------------------
   Sonde périodique de la disponibilité réelle (db + redis via /health/ready).
   Machine à états :
     healthy (>= seuil)  →  unhealthy (ALERT_UNHEALTHY_THRESHOLD échecs
     consécutifs) → webhook ALERT_WEBHOOK_URL + gauge `health_ready` + logs.
     Le retour en santé (> = seuil succès) déclenche un événement de récupération.
   Ne bloque jamais l'application (fire-and-forget, try/catch). Notre hook
   natif est un webhook JSON ; Grafana / PagerDuty / OpsGenie pourront
   s'y substituer via telemetry.use({ onHealthChange }) sans changer le serveur.
   =========================================================================== */

const { readyInfo } = require('../routes/health');
const { fire } = require('./telemetry');
const logger = require('./logger');

const INTERVAL_MS = Math.max(5000, parseInt(process.env.ALERT_CHECK_INTERVAL_MS || '30000', 10));
const THRESHOLD = Math.max(1, parseInt(process.env.ALERT_UNHEALTHY_THRESHOLD || '3', 10));
const ENABLED = !['', '0', 'false', 'no', 'off'].includes(String(process.env.ALERT_ENABLED || 'true').toLowerCase());
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';

let timer = null;
let failures = 0;
let successes = 0;
let healthy = true;
let lastEvent = null;

function current() {
  return { healthy, failures, successes, lastEvent };
}

function notify(event) {
  lastEvent = event;
  const payload = {
    project: 'cauto',
    level: event.healthy ? 'info' : 'critical',
    alert: event.healthy ? 'cauto_healthy' : 'cauto_unhealthy',
    message: event.healthy ? 'C-AUTO est de nouveau opérationnel' : 'C-AUTO indisponible (base ou redis)',
    ...event
  };
  if (WEBHOOK_URL) {
    Promise.resolve(
      fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000)
      }),
    ).catch((err) => {
      logger.warn({ msg: 'alert_webhook_failed', webhook: WEBHOOK_URL, error: String(err && err.message || err) });
    });
  }
  fire('onHealthChange', payload);
}

async function tick(metrics) {
  const info = await readyInfo();
  const dbOk = info.database.status === 'ok';
  const redisOk = info.redis.status === 'ok';
  const okNow = dbOk && redisOk;

  if (okNow) {
    failures = 0;
    successes += 1;
  } else {
    successes = 0;
    failures += 1;
  }

  if (metrics) {
    metrics.gauge('health_ready', 'Disponibilité (1=prêt, 0=dégradé)').set({}, okNow ? 1 : 0);
  }

  if (!okNow && healthy && failures >= THRESHOLD) {
    healthy = false;
    const ev = { healthy: false, consecutiveFailures: failures, consecutiveSuccesses: successes, time: new Date().toISOString(), detail: info };
    logger.error({ msg: 'alert_unhealthy', ...ev });
    notify(ev);
  } else if (okNow && !healthy && successes >= THRESHOLD) {
    healthy = true;
    const ev = { healthy: true, consecutiveFailures: 0, consecutiveSuccesses: successes, time: new Date().toISOString(), detail: info };
    logger.info({ msg: 'alert_recovered', ...ev });
    notify(ev);
  }
}

function start(metrics) {
  if (!ENABLED) {
    logger.warn({ msg: 'alerts_disabled', reason: 'ALERT_ENABLED!=true' });
    return () => {};
  }
  logger.info({
    msg: 'alerts_started',
    intervalMs: INTERVAL_MS,
    threshold: THRESHOLD,
    webhook: WEBHOOK_URL || 'none (log + métriques uniquement)'
  });
  tick(metrics).catch(() => {});
  timer = setInterval(() => { tick(metrics).catch((e) => logger.error({ msg: 'alert_tick_error', error: String(e && e.message || e) })); }, INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { start, current, readyInfo };