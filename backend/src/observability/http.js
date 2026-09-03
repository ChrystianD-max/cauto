'use strict';

/* =============================================================================
   C-AUTO — Observabilité (module 65) : middleware HTTP
   -----------------------------------------------------------------------------
   Pour chaque requête :
     - identifiant (X-Request-Id, généré ou relayé) répercuté dans les logs ;
     - mesure de latence réelle (ms) + en-tête X-Response-Time ;
     - log JSON structuré http (route, statut, durée, tailles, reqId) ;
     - métriques : compteur par route/statut + histogramme de durée (perfs API) ;
     - hooks telemetry (début/fin).
   Aucune modification de réponse existante (hors 2 en-têtes additifs).
   =========================================================================== */

const crypto = require('crypto');
const { fire } = require('./telemetry');

module.exports = function httpObservability({ metrics, logger }) {
  return (req, res, next) => {
    const start = process.hrtime.bigint();
    const reqId = String(req.headers['x-request-id'] || crypto.randomUUID());
    req.id = reqId;
    req.log = logger.child({ reqId, method: req.method, path: req.originalUrl || req.path });
    res.setHeader('X-Request-Id', reqId);

    // X-Response-Time: le header doit exister AVANT l'envoi (finish est trop
    // tard pour setHeader). On enveloppe res.end.
    const origEnd = res.end.bind(res);
    res.end = (...args) => {
      try {
        const durMsNow = Number(process.hrtime.bigint() - start) / 1e6;
        res.setHeader('X-Response-Time', String(Math.round(durMsNow * 100) / 100));
      } catch { /* ne jamais casser une réponse pour un header additif */ }
      return origEnd(...args);
    };

    fire('onRequestStart', req);

    res.on('finish', () => {
      const durMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = req.route ? req.route.path : `${req.baseUrl}${req.path === '/' ? '' : req.path}`;
      const status = String(res.statusCode);
      const statusClass = String(Math.floor(res.statusCode / 100) * 100);

      metrics.counter('http_requests_total', 'Requêtes HTTP traitées').inc(
        { route, method: req.method, status },
        1,
      );
      metrics.histogram('http_request_duration_seconds', 'Latence des réponses HTTP').observe(
        { route, status_class: statusClass },
        durMs / 1000,
      );

      req.log.info({
        msg: 'http',
        route,
        status: res.statusCode,
        status_class: Number(statusClass),
        durMs: Math.round(durMs * 100) / 100,
        reqBytes: Number(req.headers['content-length'] || 0),
        resBytes: Number(res.getHeader('content-length') || 0),
      });

      fire('onRequestFinish', req, res, durMs);
    });

    next();
  };
};