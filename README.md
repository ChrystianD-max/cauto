# C-AUTO — Plateforme de confiance automobile

Interface web + API + base de données + logique métier + permissions + persistance + gestion des erreurs, orchestrées par Docker Compose. Suite complète de tests automatisés (unitaires/integration backend, E2E Playwright).

---

## 1. Présentation

C-AUTO connecte les conducteurs, les garages/professionnels et les fournisseurs de pièces autour d'un historique automobile **fiable et immuable** :

- Carnet d'entretien, historique et programmation (moteur d'entretien `10 000 km OU 12 mois`)
- Diagnostic de panne (pré-diagnostic automatique, diagnostic réservé au professionnel)
- Devis, validation client, ordre de réparation, contrôle qualité, clôture
- Paiement (passerelles UEMOA / carte / cash / wallet) avec idempotence et webhooks dédupliqués
- Garantie 12 mois créée automatiquement au succès du paiement
- Notation des professionnels (1–5 étoiles) recalculée à chaque intervention
- Chat, attestations, pièces détachées/fournisseurs, tableaux de bord enterprise/fleet
- RBAC complet (CLIENT, GARAGE, EXPERT, SUPPLIER, FLEET_MANAGER, ADMIN, SUPER_ADMIN)
- Super admin : gestion des admins, permissions, paramètres critiques, pays, devises, intégrations, audit
- Sauvegardes validées par restauration, observabilité (logs JSON, métriques Prometheus, watchdog)

**Règle finale** : ne jamais déclarer C-AUTO « prêt » simplement parce que l'interface s'affiche — valider la checklist complète et l'ensemble des tests.

---

## 2. Architecture

```
                 INTERNET — HTTPS
                        │
        ┌───────────────┴───────────────┐
   reverse-proxy (docker compose)   Caddy (production : ACME Let's Encrypt)
                        │
        ┌───────────────┼───────────────┐
        │               │               │
  FRONTEND (SPA)    BACKEND (API)    WORKER (tâches)
  nginx :80         Express :4000    boucle Redis
        │               │               │
        └───────┬───────┴───────┬───────┘
                │               │
          POSTGRES 16       REDIS 7
                │
        STOCKAGE OBJET (S3-compatible) ou disque local
```

| Brique     | Implémentation                                        | Port/Exposition          |
|------------|-------------------------------------------------------|--------------------------|
| reverse-proxy | nginx (dev, TLS auto-signé) — remplacé par Caddy en production | 80 / 443 (hôte) |
| frontend   | SPA statique `frontend/www` servie par nginx:1.27     | interne                  |
| backend    | Node.js 20 + Express, conteneur `node:20-alpine`      | 4000 (interne)           |
| worker     | conteneur Node, boucle Redis (échéances, scans, tâches) | interne               |
| postgres   | `postgres:16-alpine` (base `cauto`)                   | 5432 (interne)           |
| redis      | `redis:7-alpine`                                      | 6379 (interne)           |

Détails techniques : le backend charge toute sa configuration depuis `.env` via `backend/src/config.js` ; aucun secret n'est écrit dans le code. Le stockage objet est fournisseur-agnostique (AWS S3, Cloudflare R2, Supabase, MinIO, B2) avec repli disque local.

---

## 3. Prérequis

- **Docker + Docker Compose v2** (méthode recommandée)
- Node.js 18+ + npm (exécution locale sans Docker / tests + lint)
- OpenSSL (génération des secrets) ; `openssl rand -hex 32`
- Navigateur moderne (Chrome pour les tests E2E Playwright)
- Windows : utiliser `npm.cmd`/`npx.cmd` depuis PowerShell (pas `npm`)

---

## 4. Installation

```bash
# 1. Environnement
cp .env.example .env
#   Windows (PowerShell) :  Copy-Item .env.example .env

# 2. Renseigner .env — OBLIGATOIRE au minimum :
#   DATABASE_URL=postgresql://cauto:cauto@localhost:5432/cauto
#   REDIS_URL=redis://localhost:6379
#   JWT_SECRET=<openssl rand -hex 32>

# 3. Construire et démarrer toute la plateforme
docker compose up -d --build
docker compose ps
```

Vérification immédiate :

```bash
curl -k https://localhost/api/health
# -> {"status":"ok","app":true,"db":true,"redis":true}
```

---

## 5. Variables environnement

Modèle complet et commenté : `.env.example` (local) et `deploy/.env.production.example` (production). Résumé des groupes :

| Groupe | Variables clés |
|---|---|
| Application | `APP_ENV`, `APP_URL`, `APP_PUBLIC_URL`, `SERVER_NAME`, `TRUST_PROXY`, `CORS_ORIGINS`, `PORT` (4000) |
| HTTPS/cookies | `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`, `REFRESH_COOKIE_NAME`, `REFRESH_COOKIE_MAX_AGE_MS` |
| Base & cache | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (**requis**), `JWT_EXPIRES_IN` (2h), `UPLOAD_DIR` |
| Démo | `DEMO_MODE` (true = paiement/SMS/GPS/IA simulés + bandeau) |
| Rate-limit | `RATE_LIMIT_API_MAX` (300/15min), `RATE_LIMIT_AUTH_MAX` (20/15min), `RATE_LIMIT_OTP_MAX` (10/15min) |
| Stockage objet | `STORAGE_MODE` (auto/s3/local), `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_BUCKET`, `STORAGE_PREFIX`, `STORAGE_FORCE_PATH_STYLE`, `STORAGE_KEEP_LOCAL`, `STORAGE_PUBLIC_URL` |
| Paiement | `PAYMENT_PROVIDER`, `PAYMENT_API_KEY`, `PAYMENT_MODE` (sandbox/live), `PAYMENT_WEBHOOK_SECRET`, `MTN_MOMO_*`, `MOOV_MONEY_*`, `WAVE_*`, `ORANGE_MONEY_*`, `CARD_*` |
| Carte/routing | `MAP_PROVIDER`, `MAP_API_KEY`, `ROUTING_PROVIDER` (haversine/external), `ROUTING_API_URL`, `ROUTING_API_KEY`, `DEFAULT_COUNTRY` (BJ), `DEFAULT_LOCALE` (fr) |
| SMS/OTP | `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_API_URL`, `SMS_SENDER`, `OTP_API_URL`, `OTP_API_KEY` |
| Email / WhatsApp / Push | `EMAIL_*`, `WHATSAPP_*`, `FIREBASE_SERVER_KEY`, `FIREBASE_PROJECT`, `NOTIF_FALLBACK_ORDER` |
| IA externe | `AI_PROVIDER`, `AI_API_KEY` (réservés ; diagnostic local actuellement) |
| Documents | `AV_SCAN_CMD`, `DOC_MAX_BYTES` (5 Mo) |
| Sauvegardes | `BACKUP_DIR`, `BACKUP_KEEP_DAILY/WEEKLY/MONTHLY`, `BACKUP_REMOTE_KEEP`, `BACKUP_NOTIFY_URL` |
| Observabilité | `LOG_LEVEL`, `METRICS_ENABLED`, `METRICS_TOKEN` (obligatoire en production), `METRICS_PREFIX`, `SERVICE_NAME`, `ALERT_*` |

Principes : aucune vraie clé dans Git ; `.env` est exclu (`.gitignore`) ; les clés ne sont lues qu'à l'exécution.

---

## 6. Base de données

- **PostgreSQL 16**, base `cauto`, user `cauto`.
- Connexion : `DATABASE_URL=postgresql://cauto:cauto@localhost:5432/cauto`.
- Schéma versionné dans `db/` : `init.sql` (socle) + `migration_v2.sql` … `migration_v21_superadmin.sql`.
- Registre des migrations appliquées : table `schema_migrations`.
- **Immutabilité** : l'historique véhicule et les audit logs ne peuvent être ni modifiés ni supprimés (triggers PostgreSQL `forbid_mutation`). La suppression d'un utilisateur ayant des audit logs échoue donc par FK `audit_logs_actor_id_fkey` (comportement attendu).
- Permissions : tables RBAC (rôles, permissions, rôles_permissions) alimentées par migration + API super admin.

Principales tables : `users`, `vehicles`, `vehicle_history`, `maintenance_program`, `interventions` (diagnostics, devis, ordres, travaux, contrôles qualité), `payments`, `warranties`, `professional_ratings`, `service_requests`, `chat_messages`, `attestations`, `parts`, `suppliers`, `countries`, `currencies`, `integrations`, `audit_logs`, `otp_codes`, `settings` (paramètres critiques).

---

## 7. Migration

Deux modes équivalents :

```bash
# A. Dans le conteneur (recommandé en environnement Docker)
docker compose exec backend node scripts/db-migrate.js

# B. Depuis l'hôte (npm dans backend/, PostgreSQL sur localhost)
cd backend
$env:DATABASE_URL = "postgresql://cauto:cauto@localhost:5432/cauto"
npm.cmd run db:migrate
```

Le runner (`backend/scripts/db-migrate.js`) applique `init.sql` puis chaque `migration_v*.sql` non encore présent dans `schema_migrations`, dans l'ordre numérique. Les migrations sont idempotentes.

**Rappel SQL** : le serveur PostgreSQL tourne avec `standard_conforming_strings=on` — échapper les apostrophes en SQL par `''` (jamais `\'`).

---

## 8. Seed

```bash
# SQL (stack réelle : pays, services, permis…) + applicatif (comptes, véhicule, interventions)
cd backend
npm.cmd run db:seed        # == db-seed.js (db/seed_v*.sql) puis seed/seed.js

# Depuis Docker :
docker compose exec backend node seed/seed.js
```

Comptes de démonstration (mot de passe commun : `Test1234!`) :

| Rôle          | Email                          |
|---------------|--------------------------------|
| Client        | `client.test@cauto.local`      |
| Client démo   | `client.demo@cauto.local`      |
| Mécanicien    | `technicien.test@cauto.local`  |
| Garage        | `garage.auto@cauto.local`, `garage.meca@cauto.local`, `pro.garage@cauto.local` |
| Expert        | `expert.diag@cauto.local`, `pro.diag@cauto.local` |
| Fournisseur   | `supplier.pieces@cauto.local`, `supplier.moteur@cauto.local`, `pro.pieces@cauto.local` |
| Flotte        | `fleet.transit@cauto.local`    |
| Admin         | `admin.demo@cauto.local`, `admin@cauto.local` |
| **Super admin** | `superadmin@cauto.local`     |

Véhicule de démo : Toyota Land Cruiser Prado 2014 — `TEST-CAUTO` / `TESTVIN00000000001` / 146 250 km.

---

## 9. Lancement local

**Mode Docker (recommandé)** — rien à installer hors Docker :

```bash
cp .env.example .env            # remplir JWT_SECRET obligatoirement
docker compose up -d --build
docker compose ps               # 6 services : reverse-proxy, frontend, backend, worker, postgres, redis
open https://localhost          # TLS auto-signé → accepter le certificat
```

**Mode local (sans Docker)** — backend + Node directement :

```bash
# Postgres et Redis doivent tourner (ex : docker compose up -d postgres redis)
cd backend
cp ../.env.example .env          # adapté DATABASE_URL/REDIS_URL localhost
npm.cmd install
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev                  # http://localhost:4000
```

Le frontend est autrement servi par nginx (`frontend/Dockerfile` → `frontend/www`, fichiers statiques `nginx:1.27-alpine`).

---

## 10. Tests

**Suite backend (unitaires + intégration)** — 125 tests, zéro régression :

```bash
cd backend
npm.cmd install
npm.cmd test                     # node --test "tests/*.test.js"
npm.cmd run lint                 # eslint src/ tests/ scripts/ seed/
```

Note : les tests s'adressent à l'API via HTTPS auto-signé ; la tolérance TLS est gérée dans `backend/tests/helpers.js`. Ne pas oublier d'éventuellement relever les rate-limits si la suite est trop volumineuse (`RATE_LIMIT_*`).

**Tests E2E Playwright** (module 55/56) :

```bash
cd e2e
npm.cmd install
npx.cmd playwright test --project=parcours     # scénario complet 23 étapes
npx.cmd playwright test --project=responsive   # contrôles responsive
```

Fichiers : `e2e/specs/parcours-complet.spec.js`, `deployment.spec.js`, `fournisseur.spec.js`, `pwa.spec.js`, `responsive.spec.js`, `certifie.spec.js`.

**Parcours de référence (interface)** : inscription/connexion → ajout véhicule → fiche véhicule (carnet, historique, programme, échéance, alertes, score) → déclaration de problème (pré-diagnostic) → recherche d'un professionnel scoré → rendez-vous → réception côté mécanicien → diagnostic (réservé au pro) → preuve photo/PDF ≤ 5 Mo → devis (pièces + MO) → validation/refus client → ordre de réparation (bloqué sans devis validé) → travaux → contrôle qualité (`passed=true` obligatoire) → clôture → paiement sandbox → garantie 12 mois → historique (immuable) → notation 1-5 → échéance recalculée. Sections annexes couvertes : travaux supplémentaires (refus client = blocage définitif 403), moteur d'entretien, permissions, hors-ligne (checklist atelier + synchronisation), paiements (idempotence + webhook dédupliqué).

---

## 11. Docker

`docker-compose.yml` (racine) définit les 6 services. Particularités :

- **Pas de bind-mount** : le code est copié dans l'image. Après toute modification de code, reconstruire puis recréer le conteneur :
  ```bash
  docker compose build backend        # ou frontend / worker
  docker compose up -d --force-recreate --no-deps backend
  ```
- Si une modification de fichier n'est pas prise en compte (cache Docker empoisonné sur `COPY src ./src`), forcer :
  ```bash
  docker compose build --no-cache backend
  ```
- Le backend exige `JWT_SECRET` (`JWT_SECRET:?JWT_SECRET is required`).
- Virus/volume : `UPLOAD_DIR=/data/uploads` — penser à un volume persistant en production pour le repli disque local.
- `backend/Dockerfile` : `node:20-alpine` + `npm install --omit=dev` + `CMD node src/server.js`. `frontend/Dockerfile` : nginx servi `frontend/www`. `worker/Dockerfile` : Node, `COPY index.js .`, `CMD node index.js`.

---

## 12. Déploiement

C-AUTO est **agnostique de l'hébergeur** : toute l'infrastructure est pilotée par `.env`. Déploiement « simple » sur VPS Docker (recommandé) :

```bash
# 1. Modèle production
cp deploy/.env.production.example .env
#    remplir notamment DATABASE_URL, REDIS_URL, JWT_SECRET, STORAGE_*, CADDY_DOMAIN

# 2. Toute la plateforme avec Caddy (HTTPS public Let's Encrypt, ACME auto)
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d
```

Le override `deploy/docker-compose.caddy.yml` :
- désactive le reverse-proxy auto-signé local (`profiles: ["_disabled"]`) ;
- monte `caddy:2.9-alpine` sur 80/443 avec certificat automatique pour chaque hôte (`CADDY_DOMAIN`, dérivés `www/app/api/admin`), HSTS, redirection HTTP→HTTPS.

Domaines (module 61) : `CADDY_DOMAIN=cauto.example` (+ `CADDY_WWW_DOMAIN`, `CADDY_APP_DOMAIN`, `CADDY_API_DOMAIN`, `CADDY_ADMIN_DOMAIN`) — changer `.env` suffit, sans toucher au code ni au Caddyfile.

Le frontend SPA est déployable séparément en statique : `deploy/frontend/` propose `vercel.json`, `netlify.toml`, Cloudflare Pages (`_redirects`, `_headers`) — l'API est jointe via `APP_PUBLIC_URL`.

---

## 13. Production

Checklist et recommandations (voir aussi `DEPLOYMENT.md` et `deploy/.env.production.example`) :

- **Secrets** : `JWT_SECRET`, `METRICS_TOKEN`, clés paiement/SMS/S3 via `openssl rand -hex 32` ; jamais en Git.
- **PostgreSQL/Redis managés** recommandés (`DATABASE_URL` avec `sslmode=require`, `REDIS_URL` `rediss://`), sinon les services du compose.
- **Stockage objet S3-compatible** (`STORAGE_MODE=s3`) pour documents/preuves/factures — sinon `UPLOAD_DIR` en volume persistant.
- **HTTPS** : Caddy ACME (ou plateforme) ; cookies de session httpOnly + `Secure` automatique en `NODE_ENV=production` ; `COOKIE_DOMAIN` pour le partage entre sous-domaines ; HSTS actif.
- **Mode démo** : `DEMO_MODE=false` obligatoire ; `PAYMENT_MODE=sandbox` pour le premier déploiement.
- **Sauvegardes validées par restauration** : `deploy/backup.sh` (dump + validation sha256 + rotation + stockage externe) puis `deploy/restore-test.sh` (restauration comparée). Une sauvegarde sans restauration réussie n'est PAS une sauvegarde.
- **Observabilité** : logs JSON structurés sur stdout, export Prometheus `/api/ops/metrics` protégé par `METRICS_TOKEN`, watchdog de disponibilité (`ALERT_*`).
- **Bases saines** : respecter les rate-limits ; vérifier le nettoyage des redirects ; tests E2E rejoués après chaque déploiement.

---

## 14. Dépannage

| Symptôme | Cause / solution |
|---|---|
| `curl https://localhost` refuse le certificat | TLS auto-signé de dev : ajouter `-k` ou accepter manuellement le certificat |
| Modif de code sans effet | Pas de bind-mount : `docker compose build <svc>` puis `up -d --force-recreate --no-deps <svc>` ; si toujours rien : `build --no-cache` |
| `npm: command not found` / alias | PowerShell : utiliser `npm.cmd` / `npx.cmd` |
| Migration SQL « syntax error near \'audit\' » | `standard_conforming_strings=on` : apostrophes SQL en `''` |
| Requête DELETE avec body « bloombe » | Le reverse-proxy supprime le body des DELETE → utiliser POST pour les mutations sensibles |
| Tests backend 429 (rate-limit) | Relever `RATE_LIMIT_API_MAX`/`_AUTH_MAX`/`_OTP_MAX` dans `.env` |
| Le backend ne démarre pas | Vérifier `JWT_SECRET` renseigné et `postgres`/`redis` joignables (`DATABASE_URL`, `REDIS_URL`) |
| `COPY src ./src` reste « CACHED » | Forcer `docker compose build --no-cache backend` (le backend n'a pas de `.dockerignore`) |
| Suppression d'un utilisateur de test échoue (FK) | Immutabilité voulue : les audit logs attachent l'acteur ; pas une erreur |
| `ssl`/TLS des tests | `NODE_TLS_REJECT_UNAUTHORIZED=0` côté hôte ; `backend/tests/helpers.js` gère la tolérance |
| Sauvegarde« échouée » | Respecter le cycle dump → restauration testée (`deploy/restore-test.sh`) avant de valider |

---

## Références

- `docs/deployment.md` — guide de déploiement local & production (module 78)
- `DEPLOYMENT.md` — déploiement simple / hébergement de test
- `DEVELOPMENT_RULES.md`, `ERROR_HANDLING_RULES.md`, `ANTI_MOCK_RULES.md`, `ANTI_FAKE_BUTTONS_RULES.md` — règles de développement
- `RAPPORT_TEST_*.md` — rapports de validation des modules