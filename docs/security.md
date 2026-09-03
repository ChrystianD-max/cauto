# Sécurité — C-AUTO

## 1. En-têtes HTTP (helmet) — `backend/src/server.js`

- `Content-Security-Policy` custom : `defaultSrc 'self'`, `baseUri 'self'`, `frameAncestors 'none'`, `objectSrc 'none'`, `formAction 'self'`, `frameSrc 'none'`, `upgradeInsecureRequests` en production ;
- `Referrer-Policy: strict-origin-when-cross-origin` ;
- `HSTS` en production : `max-age=31536000; includeSubDomains` (désactivé hors prod).

## 2. CORS

`cors({ origin: config.allowedOrigins, credentials: false })`. Origines autorisées : `APP_URL`, `APP_PUBLIC_URL`, `http://localhost:3000`, `https://localhost` + CSV `CORS_ORIGINS`. `credentials: false` (pas de cookies cross-origin).

## 3. Limites de débit & corps

- `/api` → **300 / 15 min** (`RATE_LIMIT_API_MAX`) ; auth 20/15min ; OTP 10/15min (voir `docs/authentication.md`) — `express-rate-limit` avec `standardHeaders: true` ;
- `express.json({ limit: '1mb' })` ; Caddy applique `max_size 6MB` en production.

## 4. Authentification

JWT 2h, bcrypt 12 rounds, refresh token en cookie httpOnly (rotation), OTP 6 chiffres (10 min, 5 essais, temps constant), contraintes par rôles/permissions — **détail complet : `docs/authentication.md`**.

## 5. Uploads de fichiers (`backend/src/utils/upload.js` + `routes/documents.js`)

- `multer` vers `{UPLOAD_DIR}/documents`, nom de fichier **aléatoire** (`crypto.randomBytes(16).hex + ext`) — aucun nom contrôlé par l'utilisateur ;
- limite de taille : `DOC_MAX_BYTES` — **valeur recommandée 5 Mo (`5242880`)** dans `.env.example` ; repli du code si non défini : **20 Mo** ;
- **liste blanche MIME par catégorie** (PHOTO : jpeg/png/webp ; VIDEO : mp4/webm/quicktime ; AUDIO : webm/ogg/mpeg/wav ; PDF ; INVOICE/REPORT/VEHICLE/DOCUMENT) → 415 si MIME non autorisé ;
- **sniffing magique** (`sniffMime`) : la déclaration doit correspondre à la signature détectée (anti-polyglot) → 415 en cas de discordance ;
- **scan antivirus** optionnel (`AV_SCAN_CMD`, ex. clamscan, timeout 15 s) : `CLEAN | INFECTED | DISABLED`, fichier infecté refusé (422).

## 6. Validation des entrées

zod sur toutes les entrées (`utils/validate.js`) : `schema.parse` + `passthrough()` autorisé par site d'appel ; échec → `400 VALIDATION_ERROR`. Le gestionnaire global d'erreurs ne renvoie jamais de stack trace.

## 7. Traceabilité & audit

- `X-Request-Id` relayé ou généré par requête (aucun SEGV, avec log `reqId`) + `X-Response-Time` ;
- journal **immuable** `audit_logs` (triggers `forbid_mutation`), secrets **redactés `[HIDDEN]`** (`audit.js` `reveal()`) ;
- `trust proxy` réglé à 1 hop ; `req.ip` journalisé pour OTP/refresh/audit.

## 8. Cookies de session

`cauto_refresh` : `httpOnly`, `path:/api/auth`, `sameSite:'lax'` (`COOKIE_SAME_SITE`), `secure` en production (`NODE_ENV=production`, ou `COOKIE_SECURE` forcé), durée 30 jours, domaine hôte par défaut (`COOKIE_DOMAIN` optionnel pour partager entre sous-domaines).

## 9. Stocks de secrets

Tout vient de `process.env` (`backend/src/config.js`) ; `.env` exclu du dépôt (`.gitignore`) ; modèles sans clé (`env.example`, `env.development.example`, `env.production.example`) ; `METRICS_TOKEN` requis en production sinon export Prometheus refusé (404) ; `JWT_SECRET` bloquant au démarrage si absent/`CHANGE_ME`.

## 10. Règles anti-fausses données

`ANTI_MOCK_RULES.md` (pas de fausse base en mémoire), `ANTI_FAKE_BUTTONS_RULES.md` (pas de boutons « Coming soon »), contrôles en CI (`check:antimock`, `check:nofakebuttons`).