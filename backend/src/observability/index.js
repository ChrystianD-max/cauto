'use strict';

/* =============================================================================
   C-AUTO — Observabilité (module 65) : agrégateur
   -----------------------------------------------------------------------------
   Construction unique des briques et injection dans le serveur :
     logger  : logs JSON structurés (stdout)
     metrics : registre compteurs/jauges/histogrammes (export Prometheus)
     httpMw  : middleware requête (reqId, timings, log http, métriques, hooks)
     telemetry : hooks d'extension (Sentry/OpenTelemetry/Grafana… à brancher)
     alerts  : watchdog disponibilité (db+redis) + webhook + gauges
   =========================================================================== */

const config = require('../config');
const logger = require('./logger');
const { MetricsRegistry } = require('./metrics');
const telemetry = require('./telemetry');

logger.level = config.observability.logLevel;

const metrics = new MetricsRegistry(config.observability.metricsPrefix);

const httpMw = require('./http')({ metrics, logger });

const alerts = require('./alerts');

function startAlerts() {
  return alerts.start(metrics);
}

module.exports = { logger, metrics, httpMw, telemetry, alerts, startAlerts };