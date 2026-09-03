'use strict';

/* =============================================================================
   C-AUTO — Observabilité (module 65) : sémantique d'hooks (seams)
   -----------------------------------------------------------------------------
   LE point de branchement pour les outils externes à venir : Sentry,
   OpenTelemetry (OTLP), Grafana, Datadog… Le serveur ne connaît QUE ce module
   (fire) ; chaque backend s'enregistre avec use({ onError, … }) au démarrage
   selon TELEMETRY_BACKEND (sentry | otlp | …). Aujourd'hui : no-op par défaut,
   l'implémentation ne casse jamais l'application (try/catch global).
   =========================================================================== */

const hooks = {
  onRequestStart: [], // (req)
  onRequestFinish: [], // (req, res, durMs)
  onError: [],        // (err, req)
  onHealthChange: [], // (event { healthy, consecutiveFailures, detail })
  onShutdown: [],     // ()
};

function use(fns) {
  for (const key of Object.keys(hooks)) {
    if (typeof fns[key] === 'function') hooks[key].push(fns[key]);
  }
  return () => desuse(fns);
}

function desuse(fns) {
  for (const key of Object.keys(hooks)) {
    if (typeof fns[key] === 'function') {
      hooks[key] = hooks[key].filter((f) => f !== fns[key]);
    }
  }
}

async function fire(key, ...args) {
  const callbacks = hooks[key] || [];
  for (const fn of callbacks) {
    try { await fn(...args); } catch { /* un observer ne doit jamais casser l'app */ }
  }
}

module.exports = { use, fire, hooks };