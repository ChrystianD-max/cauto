# Guide de déploiement — C-AUTO

Deux scénarios de déploiement complets : **LOCAL** (développement / démonstration / tests) et **PRODUCTION** (VPS + HTTPS public). Toute l'infrastructure est pilotée par variables d'environnement : aucun secret dans le code, aucun hébergeur imposé.

---

## Scénario LOCAL

Étapes : **Clone → .env → Docker → Migration → Seed → Run**

### 1. Clone

```bash
git clone <URL_DU_DEPOT> cauto
cd cauto
```

### 2. .env

Copier le modèle d'environnement local puis renseigner les valeurs **avant** de démarrer :

```bash
cp .env.example .env
#   Windows (PowerShell) : Copy-Item .env.example .env
```

Valeurs minimales obligatoires :

```ini
DATABASE_URL=postgresql://cauto:cauto@localhost:5432/cauto
REDIS_URL=redis://localhost:6379
JWT_SECRET=<généré, jamais vide>
```

Génération du secret :

```bash
openssl rand -hex 32        # Linux/macOS
# PowerShell : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`JWT_EXPIRES_IN=2h`, `PORT=4000`, `DEMO_MODE=true` (simulation paiements/SMS/GPS/IA + bandeau démonstration) sont les défauts du modèle.

### 3. Docker

```bash
docker compose up -d --build
docker compose ps
```

Six services démarrent : `reverse-proxy`, `frontend`, `backend`, `worker`, `postgres`, `redis`.

Particularités du dépôt :

- **Pas de bind-mount** : le code est copié dans les images. Après une modification de code :
  ```bash
  docker compose build backend        # ou frontend / worker
  docker compose up -d --force-recreate --no-deps backend
  ```
- Si une image reste « CACHED » malgré un fichier modifié (cache empoisonné) :
  ```bash
  docker compose build --no-cache backend
  ```
- `JWT_SECRET` est requis par le compose (`JWT_SECRET:?JWT_SECRET is required`).

### 4. Migration

Le schéma est versionné dans `db/` (`init.sql` + `migration_v2.sql` … `migration_v21_superadmin.sql`) et appliqué par registre (`schema_migrations`).

```bash
# Dans le conteneur (recommandé)
docker compose exec backend node scripts/db-migrate.js

# Ou depuis l'hôte
cd backend
$env:DATABASE_URL = "postgresql://cauto:cauto@localhost:5432/cauto"   # PowerShell
npm.cmd run db:migrate
```

### 5. Seed

```bash
cd backend
npm.cmd run db:seed        # == SQL db/seed_v*.sql + seed/seed.js (idempotent)

# ou dans le conteneur :
docker compose exec backend node seed/seed.js
```

Comptes de démonstration créés (mot de passe commun `Test1234!`) : `client.test@cauto.local`, `technicien.test@cauto.local`, `admin.test@cauto.local`, `superadmin@cauto.local`, `garage.auto@cauto.local`, `pro.garage@cauto.local`, `expert.diag@cauto.local`, `supplier.pieces@cauto.local`, `fleet.transit@cauto.local`…

### 6. Run

```bash
# Vérification de santé (endpoint réel, TLS auto-signé de dev)
curl -k https://localhost/api/health
# -> {"status":"ok","app":true,"db":true,"redis":true}

# Interface
https://localhost
```

Tests associés (facultatifs en local) :

```bash
cd backend && npm.cmd test        # 125 tests backend (node --test)
cd e2e && npx.cmd playwright test # E2E Playwright (10 profils)
```

---

## Scénario PRODUCTION

Étapes : **Git → CI/CD → Build → Database → Environment variables → Migration → Deploy → HTTPS → DNS → Monitoring**

### 1. Git

- Le dépôt suit le workflow Git : branche `main` = source du déploiement.
- Seuls les fichiers du dépôt sont utilisés ; `.env` n'est **jamais** commité (`.gitignore`).

### 2. CI/CD

La chaîne automatisée est prête (`.github/workflows/ci.yml`) :

```
Git push main → Lint + Typecheck → Tests (backend + e2e + observabilité + backup) → Build → Deploy
```

- **Lint + Type check** : ESLint, `tsc --noEmit`, règles anti-mock (module 67) et anti-boutons fictifs (module 68) — blocage de PR en cas d'échec.
- **Tests** : suite backend complète, E2E Playwright (10 profils) contre la stack dockérisée, checks d'observabilité (`/health/ready`, `/api/ops/info`, Prometheus protégé), backups validés par restauration (`deploy/backup.sh` + `deploy/restore-test.sh`).
- **Build** : `docker compose config --quiet` + construction des images `backend`, `worker`, `frontend`.
- **Deploy** : **branche `main` uniquement**, environnement `production` (protection par approbation), déploiement SSH avec healthcheck post-déploiement.

Secrets GitHub nécessaires (Settings → Secrets) :

| Secret | Usage |
|---|---|
| `SSH_HOST` | Hôte du VPS |
| `SSH_USER` | Utilisateur de déploiement |
| `SSH_PRIVATE_KEY` | Clé privée SSH (base64) |
| `SSH_DEPLOY_DIR` | Dossier cible (défaut `/srv/cauto`) |
| `DEPLOY_PUBLIC_URL` | URL de santé post-deploy (défaut `https://HOST`) |

### 3. Build

```bash
docker compose build backend worker frontend
docker compose config --quiet        # valide le compose
```

En CI/CD, le job `build` vérifie la construction sur `main` avant tout déploiement.

### 4. Database

- PostgreSQL **16** (base `cauto`, user `cauto`).
- Recommandé : base managée (Neon, Supabase, RDS, Aiven) + Redis managé (Upstash, Render Redis, ElastiCache) — ou les services du compose sur le VPS.
- Connexion : `DATABASE_URL=postgresql://cauto:CHANGE_ME@HOST:5432/cauto?sslmode=require` (TLS obligatoire pour une base managée).
- Le schéma se crée/applique par migration (étape 6) ; `db/init.sql` pose le socle au premier boot en local uniquement.

### 5. Environment variables

```bash
cp deploy/.env.production.example .env
```

À renseigner sur le serveur (jamais dans le dépôt) :

| Groupe | Clés requises |
|---|---|
| App / HTTPS | `APP_ENV=production`, `APP_URL`, `APP_PUBLIC_URL`, `TRUST_PROXY=1`, `CORS_ORIGINS=...` |
| Base / cache | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (obligatoire) |
| Stockage | `STORAGE_MODE=s3` + `STORAGE_ENDPOINT/REGION/ACCESS_KEY/SECRET_KEY/BUCKET/PREFIX/FORCE_PATH_STYLE` |
| Domaines | `CADDY_DOMAIN`, `CADDY_WWW_DOMAIN`, `CADDY_APP_DOMAIN`, `CADDY_API_DOMAIN`, `CADDY_ADMIN_DOMAIN` |
| Sécurité | `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`, cookies `Secure` auto en production |
| Observabilité | `METRICS_TOKEN` (obligatoire en production), `LOG_LEVEL`, `ALERT_WEBHOOK_URL` |
| Sauvegardes | `BACKUP_DIR`, `BACKUP_KEEP_*`, `BACKUP_REMOTE_KEEP` |

Principe : le même compose tourne sur n'importe quel hôte ; changer `.env` suffit (pas de modification de code ni de Caddyfile).

### 6. Migration

```bash
docker compose exec backend node scripts/db-migrate.js
```

Idempotent : applique seulement les `migration_v*.sql` absents de `schema_migrations`, dans l'ordre numérique. Automatisable dans le pipeline avant le `up` ; sinon lancer une fois à la main après le premier déploiement.

### 7. Deploy

**VPS Docker + Caddy (recommandé)** — HTTPS public automatique :

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d
```

- Le override désactive le reverse-proxy auto-signé local et monte `caddy:2.9-alpine` (80/443) avec certificats Let's Encrypt automatiques pour chaque hôte.
- En CI/CD, le job de déploiement exécute : `git pull` → `docker compose pull` → `up -d --force-recreate backend worker frontend reverse-proxy` → healthcheck `https://…/api/health`.

**Frontend SPA** alternativement statique : `deploy/frontend/` fournit `vercel.json`, `netlify.toml`, Cloudflare Pages (`_redirects`, `_headers`) — l'API est jointe via `APP_PUBLIC_URL`.

### 8. HTTPS

- **Caddy** émet et renouvelle automatiquement les certificats **Let's Encrypt** pour chaque hôte (`deploy/Caddyfile`) : celui-ci force également la redirection **HTTP → HTTPS (308)** et envoie **HSTS** (`max-age=31536000; includeSubDomains`) + anti-sniffing.
- Limite de corps : `max_size 6MB` côté Caddy.
- Cookies de session backend : `httpOnly` + `Secure` automatique en production (`COOKIE_DOMAIN` pour le partage entre sous-domaines).

### 9. DNS

- Pointer les enregistrements **A/AAAA** vers l'IP publique du VPS, pour **chacun** de ces hôtes :
  - `CADDY_DOMAIN` (racine, ex. `cauto.example`)
  - `www.cauto.example` · `app.cauto.example` · `api.cauto.example` · `admin.cauto.example` (les 4 dérivés sont optionnels, déduits de la racine s'ils ne sont pas renseignés)
- Caddy résout les certificats dès que le DNS pointe ; aucun fichier de certificat à gérer.

### 10. Monitoring

- **Logs JSON structurés** sur stdout (`LOG_LEVEL`) → collectables par Docker json-file, Loki, Datadog…
- **Métriques Prometheus** protégées : `/api/ops/metrics` (Bearer `METRICS_TOKEN`) ; **obligatoire** : sans token configuré l'endpoint est refusé (404) en production — jamais exposé nu. Namespace `cauto` (`METRICS_PREFIX`).
- **Disponibilité réelle** : `/health/ready` (db + redis) et `/api/ops/info` (runtime, alertes, latences).
- **Watchdog d'alerte** : après `ALERT_UNHEALTHY_THRESHOLD` sondes dégradées consécutives, `ALERT_WEBHOOK_URL` est notifié (et à la récupération) — idéal pour brancher Slack/Discord/PagerDuty.
- **Sauvegardes** : planifier `deploy/backup.sh` (cron quotidien → rotation + stockage objet S3) et vérifier régulièrement `deploy/restore-test.sh` (restauration testée). Une sauvegarde sans restauration réussie n'est PAS une sauvegarde.

---

## Récapitulatif des commandes clés

| Action | Commande |
|---|---|
| Démarrer (local) | `docker compose up -d --build` |
| Santé locale | `curl -k https://localhost/api/health` |
| Migration | `docker compose exec backend node scripts/db-migrate.js` |
| Seed | `cd backend && npm.cmd run db:seed` |
| Tests backend | `cd backend && npm.cmd test` |
| E2E | `cd e2e && npx.cmd playwright test` |
| Production (Caddy) | `docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d` |
| Rebuild après code modifié | `docker compose build <svc> && docker compose up -d --force-recreate --no-deps <svc>` |
| Rebuild forcé (cache) | `docker compose build --no-cache backend` |
| Sauvegarde / restauration testée | `deploy/backup.sh` · `deploy/restore-test.sh` |