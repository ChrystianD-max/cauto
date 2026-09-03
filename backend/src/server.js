const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('./config');
const { HttpError } = require('./utils/errors');
const { errorBody, safeMessage } = require('./utils/errorResponse');
const { autoPagination } = require('./middlewares/pagination');
const { logger, metrics, httpMw, telemetry, startAlerts } = require('./observability');

if (!config.jwtSecret || config.jwtSecret === 'CHANGE_ME') {
  logger.fatal('JWT_SECRET doit être défini (voir .env.example). Refus de démarrer.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
// Module 41 — Sécurité : CSP stricte côté API (ni frame externalisé, ni embeds),
// enheaders de protection activés pour la navigation.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.env === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false
}));
app.use(cors({ origin: config.allowedOrigins, credentials: false }));
app.use(express.json({ limit: '1mb' }));

// Module 65 — Observabilité : requêtes (reqId, timing, log, métriques) avant
// toute logique applicative (429/4xx inclus) afin de tout mesurer.
app.use(httpMw);

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_API_MAX || 300), standardHeaders: true }));
app.use('/api', autoPagination);

app.use('/health', require('./routes/health'));
app.use('/api/health', require('./routes/health').legacy);
app.use('/api/config', require('./routes/config'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/issues', require('./routes/issues'));
app.use('/api/professionals', require('./routes/professionals'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/interventions', require('./routes/interventions'));
app.use('/api/payments', require('./routes/payments').router);
app.use('/api/diagnostic', require('./routes/diagnostic'));
app.use('/api/fault-codes', require('./routes/faultCodes'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/ratings', require('./routes/ratings'));
app.use('/api/reviews', require('./routes/ratings'));
app.use('/api/service-requests', require('./routes/serviceRequests'));
app.use('/api/quotes', require('./routes/quotes'));
app.use('/api/repairs', require('./routes/repairs'));
app.use('/api/second-opinions', require('./routes/secondOpinions'));
app.use('/api/warranties', require('./routes/warranties'));
app.use('/api/disputes', require('./routes/disputes'));
app.use('/api/parts', require('./routes/parts'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/fleet', require('./routes/fleet'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/gps', require('./routes/gps'));
app.use('/api/matching', require('./routes/matching'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/super-admin', require('./routes/superAdmin'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/innovations', require('./routes/innovations'));
app.use('/api', require('./routes/countries'));
app.use('/api/i18n', require('./routes/i18n'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api', require('./routes/docs'));
app.use('/api/ops', require('./routes/ops'));

app.use('/api', (_req, res) => {
  res.status(404).json(errorBody(404, 'Route introuvable', 'NOT_FOUND'));
});

// Module 65 + 69 — Erreurs structurées (success:false + error{code,message}) :
// log structuré (reqId), hooks Sentry/OTel… Aucune stack trace n'est exposée au
// client (en production comme en développement) — seuls code + message lisibles.
app.use((err, req, res, _next) => {
  if (err instanceof HttpError) {
    telemetry.fire('onError', err, req);
    return res.status(err.status).json(errorBody(err.status, safeMessage(err), err.code, err.details));
  }
  if (err instanceof z.ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return res.status(400).json(errorBody(400, 'Données invalides', 'VALIDATION_ERROR', details));
  }
  const status = err.status || err.statusCode;
  if (status && status < 500) return res.status(status).json(errorBody(status, safeMessage(err), err.code || 'REQUEST_ERROR'));
  const reqLog = req.log || logger;
  metrics.counter('errors_total', 'Erreurs 5xx').inc({}, 1);
  reqLog.error({ msg: 'unhandled_error', err: String(err && err.stack || err) });
  telemetry.fire('onError', err, req);
  res.status(500).json(errorBody(500, 'Erreur interne', 'INTERNAL'));
});

const server = app.listen(config.port, () => {
  logger.info(`C-AUTO backend listening on :${config.port} (${config.env})`);
  startAlerts();
});

process.on('SIGTERM', () => {
  telemetry.fire('onShutdown');
  server.close(() => process.exit(0));
});
