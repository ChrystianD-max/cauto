// Module 51 : environnement local. dotenv charge .env (racine du dépôt) en dev ;
// en Docker/Compose l'environnement est injecté par le service et PRIME toujours
// (dotenv ne remplace jamais une variable déjà définie). Aucune clé en dur.
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT || '4000', 10),
  env: process.env.NODE_ENV || 'staging',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://cauto:cauto@postgres:5432/cauto',
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  // URL publique par laquelle l'application est réellement servie (utilisée
  // pour l'origin CORS/CSRF de production, ex : https://c-auto.example.com).
  appPublicUrl: process.env.APP_PUBLIC_URL || process.env.APP_URL || 'http://localhost:3000',
  // Origines autorisées pour CORS (module 61 — domaines). Toujours acceptées :
  // appUrl, appPublicUrl, les hôtes de dev. En plus, CORS_ORIGINS (CSV) permet
  // de déclarer les autres sous-domaines du déploiement (app.*, admin.*, CDN…),
  // quand le frontend n'est pas servi par la même origine que l'API.
  allowedOrigins: [
    process.env.APP_URL || 'http://localhost:3000',
    process.env.APP_PUBLIC_URL || process.env.APP_URL || 'http://localhost:3000',
    'http://localhost:3000',
    'https://localhost',
    ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  ].filter((v, i, self) => v && self.indexOf(v) === i),
  uploadDir: process.env.UPLOAD_DIR || '/data/uploads',
  // Passerelle de stockage objet fournisseur-agnostique (modules 59/60).
  // STORAGE_MODE : auto (défaut) | local | s3. Voir services/storage/index.js.
  storage: {
    mode: process.env.STORAGE_MODE || 'auto',
    endpoint: process.env.STORAGE_ENDPOINT || '',
    region: process.env.STORAGE_REGION || 'auto',
    accessKey: process.env.STORAGE_ACCESS_KEY || '',
    secretKey: process.env.STORAGE_SECRET_KEY || '',
    bucket: process.env.STORAGE_BUCKET || '',
    // Force les chemins de style /bucket/key (requis pour R2, MinIO, Supabase,
    // Backblaze B2, Ceph) ; false = style hébergé (AWS S3 usuel).
    forcePathStyle: ['true', '1', 'yes', 'on'].includes(String(process.env.STORAGE_FORCE_PATH_STYLE || '').toLowerCase()),
    prefix: (process.env.STORAGE_PREFIX || 'cauto').replace(/^\/+|\/+$/g, ''),
    // Conserver une copie locale en plus de l'objet distant (ex : volume pour
    // scans antivirus). false = le support de stockage est le stockage objet.
    keepLocal: ['true', '1', 'yes', 'on'].includes(String(process.env.STORAGE_KEEP_LOCAL || '').toLowerCase()),
    // URL publique éventuelle pour servir les objets directement (CDN) :
    // si vide, ils sont servis via l'API (/api/documents/:id/download).
    publicUrl: process.env.STORAGE_PUBLIC_URL || ''
  },
  // Module 67 — NOTIFICATIONS PUSH (Web Push, protocole VAPID).
  // La clé PUBLIQUE est publique par nature (elle identifie le serveur pour les
  // abonnements navigateur). La clé PRIVÉE vit uniquement dans l'environnement
  // (VAPID_PRIVATE_KEY, jamais commitée) ; sans elle le push est désactivé.
  push: {
    vapidPublicKey: (process.env.VAPID_PUBLIC_KEY || 'BJF9pZvKR7dstY1Nmq7pV9YVkYPdvPJ7vCOydQAuPRbMOPb_pbCFN1Z0E-k4hL44R5tPfgJgya7oKOlSQHZAfa0').trim(),
    vapidPrivateKey: (process.env.VAPID_PRIVATE_KEY || '').trim(),
    vapidSubject: (process.env.VAPID_SUBJECT || 'mailto:admin@cauto.local').trim()
  },
  // Module 50 : MODE DÉMONSTRATION.
  // DEMO_MODE=true fige toutes les intégrations externes (paiement réel, SMS,
  // WhatsApp, GPS temps réel, IA externe) en mode simulé : la plateforme reste
  // testable de bout en bout sans jamais émettre une opération réelle.
  demoMode: ['true', '1', 'yes', 'on'].includes(String(process.env.DEMO_MODE || '').toLowerCase()),
  // Module 70 — ARCHITECTURE IA.
  // Abstraction fournisseur d'IA remplaçable (voir src/services/ai). Quatre
  // services métier (DiagnosticAI, MaintenanceAI, QuoteAnalysisAI,
  // VehicleHistoryAI) consomment le manager ; toute décision critique reste
  // produite par le fournisseur de RÈGLES (déterministe). Un fournisseur LLM
  // externe, s'il est activé, n'ajoute qu'une couche "insight" (explicative),
  // jamais une décision engageante.
  //   AI_PROVIDER   : 'rules' (défaut) | 'openai' | 'anthropic'
  //   AI_OPENAI_KEY / AI_ANTHROPIC_KEY : clés API ; absentes ⇒ auto-règles.
  ai: {
    provider: process.env.AI_PROVIDER || 'rules',
    enabled: ['true', '1', 'yes', 'on'].includes(String(process.env.AI_ENABLED || 'true').toLowerCase()),
    timeoutMs: Math.max(1000, parseInt(process.env.AI_TIMEOUT_MS || '8000', 10)),
    model: process.env.AI_MODEL || '',
    openai: {
      key: process.env.AI_OPENAI_KEY || '',
      baseUrl: process.env.AI_OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.AI_OPENAI_MODEL || 'gpt-4o-mini'
    },
    anthropic: {
      key: process.env.AI_ANTHROPIC_KEY || '',
      baseUrl: process.env.AI_ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
      model: process.env.AI_ANTHROPIC_MODEL || 'claude-3-5-haiku-latest'
    }
  },
  // Module 62 — HTTPS : le refresh token est aussi déposé en cookie httpOnly.
  // Secure:true en production (HTTPS uniquement, jamais envoyé en clair) ;
  // COOKIE_SECURE permet de forcer le flag (derrière un proxy TLS local).
  // COOKIE_DOMAIN : domaine parent éventuel pour partager le cookie entre les
  // sous-domaines api./app./admin. (same-site → SameSite Lax suffit).
  cookie: {
    name: process.env.REFRESH_COOKIE_NAME || 'cauto_refresh',
    httpOnly: true,
    secure: process.env.COOKIE_SECURE
      ? ['true', '1', 'yes', 'on'].includes(String(process.env.COOKIE_SECURE).toLowerCase())
      : process.env.NODE_ENV === 'production',
    sameSite: String(process.env.COOKIE_SAME_SITE || 'lax').toLowerCase(),
    domain: process.env.COOKIE_DOMAIN || undefined,
    path: '/api/auth',
    maxAgeMs: parseInt(process.env.REFRESH_COOKIE_MAX_AGE_MS || String(30 * 24 * 3600 * 1000), 10)
  },
  // Module 65 — Observabilité : logs structurés, métriques, alertes, disponibilité.
  // Architecture extensible (Sentry / OpenTelemetry / Grafana) via
  // src/observability/telemetry.js (hooks) + export Prometheus natif.
  observability: {
    serviceName: process.env.SERVICE_NAME || 'cauto-backend',
    version: (() => { try { return require('../package.json').version; } catch { return 'unknown'; } })(),
    logLevel: process.env.LOG_LEVEL || 'info',
    metricsEnabled: ['true', '1', 'yes', 'on'].includes(String(process.env.METRICS_ENABLED || 'true').toLowerCase()),
    metricsPrefix: (process.env.METRICS_PREFIX || 'cauto').replace(/[^a-z0-9_]/gi, '').replace(/_+$/, '') || 'cauto',
    // Token Bearer protégeant l'export Prometheus. En production, sans token
    // configuré, l'endpoint est REFUSÉ (404) — jamais exposé sans authentification.
    metricsToken: process.env.METRICS_TOKEN || '',
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || '',
    alertEnabled: !['', '0', 'false', 'no', 'off'].includes(String(process.env.ALERT_ENABLED || 'true').toLowerCase()),
    alertThreshold: Math.max(1, parseInt(process.env.ALERT_UNHEALTHY_THRESHOLD || '3', 10)),
    alertCheckIntervalMs: Math.max(5000, parseInt(process.env.ALERT_CHECK_INTERVAL_MS || '30000', 10))
  }
};
