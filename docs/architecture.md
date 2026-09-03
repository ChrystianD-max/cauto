# Architecture — C-AUTO

## 1. Vue d'ensemble

C-AUTO est une plateforme web de confiance automobile : interface (SPA), API (Node/Express), base de données (PostgreSQL), tâches périodiques (worker), orchestrées par Docker Compose. Aucun hébergeur imposé : tout est piloté par variables d'environnement.

```
                 INTERNET — HTTPS (TLS auto-signé en dev, Caddy/ACME en prod)
                        │
        ┌───────────────┴───────────────┐
   reverse-proxy (nginx, dev)      Caddy (production, Let's Encrypt)
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  FRONTEND (SPA)    BACKEND (API)    WORKER (tâches)
  nginx :80         Express :4000    Node, scan 60 s
        │               │               │
        └───────┬───────┴───────┬───────┘
                │               │
          POSTGRES 16       REDIS 7
                │
   STOCKAGE OBJET (S3-compatible) ou disque local (UPLOAD_DIR)
```

## 2. Services (docker-compose.yml)

| Service | Image / runtime | Exposition | Rôle |
|---|---|---|---|
| `reverse-proxy` | nginx | 80:80, 443:443 (dev, TLS auto-signé) | Terminaison TLS de dev, routage vers frontend/backend |
| `frontend` | `nginx:1.27-alpine` (sert `frontend/www`) | interne :80 | SPA statique (HTML/CSS/JS natif) |
| `backend` | `node:20-alpine` (`backend/`) | interne :4000 | API Express, métier, persistance, observable |
| `worker` | `node:20-alpine` (`worker/`) | — | Scan des échéances d'entretien (60 s) + ping Redis |
| `postgres` | `postgres:16-alpine` | interne :5432 | Source de vérité, schéma versionné, immutabilité |
| `redis` | `redis:7-alpine` | interne :6379 | Cache distribuable, tests de santé, files légères |

Le compose **n'utilise pas de bind-mount** : le code est copié dans les images. Toute modification de code impose `docker compose build <svc>` puis `up -d --force-recreate --no-deps <svc>` (voir `docs/deployment.md`).

## 3. Backend — découpage

```
backend/src/
├── server.js              # montage express : helmet, CORS, rate-limit global, /api, erreurs
├── config.js              # centralise process.env (aucun secret en dur)
├── db.js                  # pool pg + transactions (db.tx)
├── middlewares/
│   ├── auth.js            # requireAuth / requireRole / requirePermission / ROLES / signToken
│   ├── confirmAuth.js     # requireSuperConfirm(password|otp) — 2e facteur super-admin
│   ├── audit.js           # journal immuable audit_logs (+ redaction [HIDDEN])
│   └── pagination.js      # autoPagination (page/limit)
├── routes/                # controllers par domaine (/api/*) — voir docs/api.md
├── services/
│   ├── ai/                # AIManager (décideur = rules), services DiagnosticAI…, providers rules/llm
│   ├── payment/           # PaymentManager + providers (mobile money, card, cash, wallet)
│   ├── gps/               # geo (haversine), Routing, ETA, Location
│   ├── storage/           # passerelle S3-compatible (auto/s3/local)
│   └── mode/              # integrationStatus (simulation selon DEMO_MODE)
├── utils/
│   ├── maintenanceEngine.js   # moteur « X km OU Y mois » + program constructor
│   ├── matchingEngine.js      # scoring professionnels (poids depuis matching_profiles)
│   ├── diagnosticService.js   # pré-diagnostic déterministe par symptômes + DTC
│   ├── dtcKnowledge.js        # doctrines/causes/tests des codes DTC connus
│   ├── validate.js            # middleware zod
│   └── upload.js              # multer + MIME + sniffing magique + antivirus
└── observability/          # logger JSON stdout, métriques Prometheus, watchog, telemetry
```

## 4. Brique frontend

SPA statique dans `frontend/www/`, servie par nginx. Communique avec l'API via HTTPS sur la même origine (dev : `https://localhost`) ou via `APP_PUBLIC_URL` + `CORS_ORIGINS` en multi-domaines. Le fichier `frontend/Dockerfile` copie `www/` dans `/usr/share/nginx/html`.

## 5. Flot de données type (intervention)

1. Client déclare un problème (`/api/issues`, pré-diagnostic auto `diagnosticService`).
2. Client cherche un professionnel (`/api/professionals`, scoring `matchingEngine`) → demande de rendez-vous (`/api/appointments` / `service-requests`).
3. Le pro réceptionne (`reception`), diagnostique (`diagnostic` réservé pro), soumet un devis (`/api/quotes`).
4. Le client valide/refuse ; l'ordre de réparation se crée (bloqué sans devis approuvé).
5. Travaux, contrôle qualité (`passed=true`), clôture, paiement (`/api/payments`).
6. Au succès : garantie 12 mois, historique immuable, notation, échéance recalculée.

## 6. Hooks d'extension

- `AI_PROVIDER` : `rules` (défaut) | `openai` | `anthropic` — le fournisseur de règles reste toujours l'autorité de décision, le LLM n'ajoute qu'un *insight*.
- `STORAGE_MODE` : `auto` | `s3` | `local` — passerelle S3-compatible interchangeable.
- Observabilité : `src/observability/telemetry.js` expose des hooks (Sentry/OpenTelemetry/Grafana) sans toucher au serveur.