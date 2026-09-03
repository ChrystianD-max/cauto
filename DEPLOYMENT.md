# C-AUTO — Déploiement simple & hébergement de test (modules 59/60)

C-AUTO est prêt à être déployé **sans être lié à un hébergeur particulier** :
toute l'infrastructure est pilotée par variables d'environnement et les
fichiers sont rattachés à une **passerelle de stockage objet S3-compatible**
(repli disque local). Une seule commande suffit pour monter l'ensemble en
production sur un VPS.

## 1. Architecture cible

```
                 INTERNET
                    │  DNS → DOMAINE
                    ▼
            HTTPS/TLS (Caddy auto-ACME ou plateforme)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   FRONTEND (SPA statique)   BACKEND (API Node)   WORKER (tâches)
   nginx — prêt à servir        :4000                 boucle Redis
   sur tout hébergeur statique
        │                       │                       │
        └───────────┬───────────┴───────────┬───────────┘
                    ▼                       ▼
            POSTGRES (managé)          REDIS (managé)
                    │
                    ▼
        STORAGE OBJET (S3-compatible) — docs, preuves, factures
        AWS S3 · Cloudflare R2 · Supabase · MinIO · B2
```

| Brique        | Implémentation        | Options hébergeurs (aucun imposé)                       |
|---------------|-----------------------|---------------------------------------------------------|
| Frontend      | SPA statique + nginx  | Vercel, Cloudflare Pages, Netlify, GitHub Pages, S3+CDN, nginx du VPS |
| Backend       | Conteneur Docker      | VPS + Docker, Coolify, CapRover, Railway, Render, Fly.io |
| Worker        | Conteneur Docker      | même plateforme que le backend (service/second process) |
| PostgreSQL    | managé ou conteneur   | Neon, Supabase, RDS, Aiven, postgres du compose          |
| Redis         | managé ou conteneur   | Upstash, Render Redis, ElastiCache, redis du compose     |
| Stockage      | S3-compatible         | Cloudflare R2, Supabase Storage, MinIO, AWS S3, B2       |
| TLS           | Caddy (ACME auto)     | Caddy, plateforme, load-balancer du fournisseur          |

Toutes les chaînes de connexion / clés sont lues dans `.env` au démarrage
(`backend/src/config.js`). Les fichiers de C-AUTO ne contiennent aucune clé.

## 2. Pré-requis

- Docker + Docker Compose (v2).
- Un domaine pointé vers votre hôte (DNS A/AAAA) pour le HTTPS Caddy.
- Génération des secrets : `openssl rand -hex 32`.

## 3. Déploiement « simple » — VPS Docker (recommandé)

1. Copier le modèle de production :
   ```bash
   cp deploy/.env.production.example .env
   # remplir : DATABASE_URL, REDIS_URL, JWT_SECRET, STORAGE_*, CADDY_DOMAIN
   ```
2. Démarrer **toute la plateforme** avec le profil Caddy (HTTPS public auto) :
   ```bash
   docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d
   ```
3. Vérifier :
   ```bash
   curl -fsS https://DOMAINE/api/config
   curl -fsS https://DOMAINE/api/health
   ```
   Les healthchecks (postgres/redis/backend/frontend) font redémarrer
   automatiquement les services défaillants et conditionnent `depends_on`.

4. Backup quotidien (cron) :
   ```bash
   0 3 * * * cd /opt/cauto && BACKUP_DIR=$PWD/backups ./deploy/backup.sh
   ```

> Sans Caddy (hébergement de test interne) : `docker compose up -d` et accès par
> `https://localhost` (reverse-proxy self-signed local).

## 4. Variation — plateformes PaaS (Railway, Render, Fly.io, Coolify, CapRover) & frontend statique

- **Backend + worker** : déployer le conteneur. Définir les variables
  d'environnement du fichier `.env.production.example` dans la plateforme
  (les bases managées fournissent DATABASE_URL / REDIS_URL prêts à coller).
- **Frontend — plateformes « compatibles Next.js »** (Vercel, Netlify,
  Cloudflare Pages) : le build est un dossier statique (`frontend/www`).
  L'appel à l'API est relatif (`/api/…`) donc **aucune adresse d'hôte n'est
  gravée** dans le bundle ; il reste à poser le proxy `/api` + le repli SPA +
  les règles de cache. Les fichiers prêts à l'emploi sont dans
  `deploy/frontend/` (`vercel.json`, `netlify.toml`, Cloudflare
  `_redirects`/`_headers`) : copier le fichier dans `frontend/www`, remplacer
  `__BACKEND_API_ORIGIN__` par l'URL publique du backend, déployer avec
  document root = `frontend/www`. Procédure complète : `deploy/frontend/README.md`.
- **TLS** : fourni par la plateforme (HTTPS par défaut, TRUST_PROXY=1 déjà actif).
- Le `worker` se lance comme service séparé (`CMD node index.js`).

## 5. Domaines (module 61)

C-AUTO est préparé pour la topologie suivante — **le domaine réel sera
configuré ultérieurement** : il suffit de le poser dans `.env`, aucun code ni
Caddyfile ne change.

| Hôte                        | Rôle                                                                  | Cible (Caddy) |
|-----------------------------|-----------------------------------------------------------------------|---------------|
| `c-auto.xxx` / `www.c-auto.xxx` | Marketing + application (`/app`) + API (`/api`)                     | frontend (+ backend pour `/api`) |
| `app.c-auto.xxx`            | Application (SPA) : par défaut, tableau de bord `#/app`               | frontend      |
| `api.c-auto.xxx`            | API seule                                                             | backend       |
| `admin.c-auto.xxx`          | Application (SPA) : par défaut, zone admin `#/admin/dashboard`        | frontend      |

> `app.*` et `admin.*` servent le même bundle : la route par défaut est choisie
> par l'application selon l'hôte (`defaultRouteForHost()`). L'API accepte ces
> origines via `CORS_ORIGINS` (CSV) — le frontend est déjà portatif (`/api`
> relatif), les sous-domaines sont donc surtout une organisation d'URLs.

### DNS

| Enregistrement | Type   | Valeur                                    |
|----------------|--------|-------------------------------------------|
| `c-auto.xxx`   | A / AAAA | IP du VPS (ou CNAME vers la platforme)   |
| `www.c-auto.xxx` | CNAME | `c-auto.xxx`                             |
| `app.c-auto.xxx` | CNAME | `c-auto.xxx`                            |
| `api.c-auto.xxx` | CNAME | `c-auto.xxx`                            |
| `admin.c-auto.xxx` | CNAME | `c-auto.xxx`                          |

### Caddy multi-domaines (VPS)

`deploy/Caddyfile` + `deploy/docker-compose.caddy.yml` déclarent les cinq hôtes
avec des certificats Let's Encrypt **automatiques par hôte**. Variables
`CADDY_DOMAIN`, `CADDY_WWW_DOMAIN`, `CADDY_APP_DOMAIN`, `CADDY_API_DOMAIN`,
`CADDY_ADMIN_DOMAIN` (les quatre dérivés prennent `…${CADDY_DOMAIN}` par défaut).
Exemple réel : `CADDY_DOMAIN=c-auto.com` → `www.c-auto.com`, `app.c-auto.com`,
`api.c-auto.com`, `admin.c-auto.com`.

### Plateformes PaaS / statiques

Chaque hôte publie à sa porte : frontend (marketing + `/app`) et backend (`/api`)
comme au §4 ; `app.*`/`admin.*` pointent le même déploiement frontend ;
`api.*` pointe exclusivement le backend. Les origines frontend complémentaires
vont dans `CORS_ORIGINS`.

## 6. Services managés — branchement

**PostgreSQL** : tout fournisseur est accepté tant que la chaîne est
`postgresql://user:pass@host:port/db` (sql standard, pas de dépendance à un
dialecte maison). `sslmode=require` conseillé.

**Redis** : `redis://` (ou `rediss://` pour TLS). Le backend (ioredis) et le
worker s'appuient uniquement sur REDIS_URL.

**Stockage objet** (docs, preuves d'intervention, factures) :

| Fournisseur            | STORAGE_ENDPOINT                                 | REGION | PATH_STYLE |
|------------------------|--------------------------------------------------|--------|------------|
| Cloudflare R2          | `https://<account>.r2.cloudflarestorage.com`     | auto   | true       |
| Supabase Storage (S3)  | `https://<ref>.supabase.co/storage/v1/s3`        | auto   | true       |
| MinIO                  | `https://minio.example.com`                      | votre  | true       |
| AWS S3                 | `https://s3.<région>.amazonaws.com`              | région | false      |
| Backblaze B2           | `https://s3.<région>.backblazeb2.com`            | région | true       |

- Mode **local** (aucune variable S3 renseignée) : fichiers dans le volume
  `uploads` (`UPLOAD_DIR`). Mode **s3** : publication automatique à l'upload.
- Lecture : vos propres fichiers restent servis par l'API (same-origin) ; si
  `STORAGE_PUBLIC_URL` est renseignée (CDN), les objets peuvent être servis
  directement depuis le domaine public du bucket.
- `STORAGE_KEEP_LOCAL=true` : conserve une copie locale en plus du bucket
  (utile pour scanner les fichiers avec un antivirus local).

## 7. Hébergement de test (module 59)

- **Interne** : `docker compose up -d` sur la machine de test — accès
  `https://localhost` (healthchecks inclus). Les taux de débit sont relevables
  via `RATE_LIMIT_*` (voir `.env`).
- **Exposé temporaire** (partenaire, recette) :
  - Cloudflare Tunnel : `cloudflared tunnel --url http://localhost:80`
    (ou via `docker compose -f docker-compose.caddy.yml` avec un domaine de
    test → le HTTPS est alors déjà géré) ;
  - VPS de test : lancer le profil Caddy (§3) sur un domaine de préprod —
    l'environnement est dédié `APP_ENV=staging`, `DEMO_MODE=false`.
- La suite E2E se lance à l'identique contre une instance URL (`baseURL` Playwright).

## 8. HTTPS & cookies sécurisés (module 62)

En production, **tout accès doit aboutir sur HTTPS** :

### 8.1 Redirection HTTP → HTTPS

- **Caddy** (`deploy/Caddyfile`) : redirection **permanente** (308) explicite
  pour les cinq hôtes (`c-auto.xxx`, `www.`, `app.`, `api.`, `admin.`) :
  `http://…  redir https://{host}{uri} permanent`. Caddy l'applique déjà par
  défaut (auto-HTTPS) ; la règle explicite rend le comportement garanti.
- **Plateformes PaaS** : la redirection HTTP→HTTPS est activée à leur niveau
  (`render.json`, Railway, Fly.io…).
- **Local** : le reverse-proxy nginx ne sert que 443 (pas d'écoute HTTP).

### 8.2 HSTS (Strict-Transport-Security)

- Backend (helmet, en `NODE_ENV=production`) : `max-age=31536000; includeSubDomains`
  sur toutes les réponses `/api`.
- Caddy : en-tête `Strict-Transport-Security` envoyé sur les quatre hôtes HTTPS.
- Effet : une fois le domaine visité en HTTPS, le navigateur refuse le HTTP et
  remonte automatiquement les requêtes (paramétrage implicite max-age 1 an).

### 8.3 Cookies sécurisés

Le refresh token est déposé en **cookie httpOnly** en plus de la réponse JSON :

| Attribut | Valeur | Pourquoi |
|---|---|---|
| `HttpOnly` | toujours | inaccessible au JS (exfiltration XSS impossible) |
| `Secure` | `true` en production | jamais transmis en clair (HTTPS exigé) |
| `SameSite` | `Lax` | bloqué de site à site (CSRF) ; sous-domaines = même site |
| `Path` | `/api/auth` | uniquement consommé par `POST /api/auth/refresh` et `/logout` |
| `Max-Age` | 30 jours | aligné sur la durée de vie du refresh token |
| `Domain` | optionnel (`COOKIE_DOMAIN`) | `.c-auto.xxx` pour partage api./app./admin. |

- Refus du cookie en clair : un `Secure` cookie n'est jamais posé sur HTTP ; en
  production TOUT est déjà redirigé vers HTTPS (8.1).
- `POST /api/auth/refresh` et `/logout` acceptent le token **dans le corps OU
  dans le cookie** ; `/logout` efface toujours le cookie.
- Variables : `COOKIE_SECURE`, `COOKIE_SAME_SITE`, `COOKIE_DOMAIN`,
  `REFRESH_COOKIE_NAME`, `REFRESH_COOKIE_MAX_AGE_MS` (voir `.env.example`).

## 9. Sécurité (checklist de mise en production)

- [ ] `JWT_SECRET` régénéré, hors code (`openssl rand -hex 32`).
- [ ] `DEMO_MODE=false` (toujours) ; `PAYMENT_MODE=sandbox` tant que la
      passerelle n'est pas contractualisée.
- [ ] Rate limits production actifs (`RATE_LIMIT_API_MAX=300`, `AUTH=20`, `OTP=10`).
- [ ] HTTPS seul (Caddy/plateforme) ; HSTS activé par helmet en production
      et par le Caddyfile (module 62).
- [ ] Postgres/Redis managés avec TLS (sslmode=require, rediss://).
- [ ] Bucket objet privé (lecture publique uniquement si CDN voulu) ; clés S3
      restreintes au bucket C-AUTO.
- [ ] Sauvegardes automatiques (`deploy/backup.sh` + copie hors-site).
- [ ] Moniteurs : `/health`, `/api/health` exposés pour le suivi de la plateforme.

## 10. Absence de verrouillage (no vendor lock-in)

Tout est **portable d'un hébergeur vers un autre** sans modification de code :

1. Les connexions (PG/Redis) sont de simples chaînes dans `.env`.
2. Les fichiers utilisent une passerelle S3-compatible (remplacement du bucket
   ou du fournisseur = changement de variables).
3. Le frontend est un SPA statique sans URL d'API figée (relatif `/api`).
4. Le schéma PostgreSQL est standard ; la migration de l'infrastructure ne
   touche ni le code applicatif ni les données.

## 11. CI/CD (module 63)

Le pipeline est défini dans `.github/workflows/ci.yml` (GitHub Actions).

### 11.1 Chaîne du pipeline

Chaque `git push` / `pull request` sur `main` déclenche :

```
Git push
   │
   ▼
1. Lint          (ESLint backend — blocage sur erreurs structurelles)
   │
   ▼
2. Type check    (tsc --noEmit — le backend JS est vérifié par tsc)
   │
   ▼
3. Tests         (CRITIQUES — bloquent le déploiement)
   ├─ backend : node --test, 72 tests
   └─ e2e     : Playwright, 10 profils responsive, sur la stack dockérisée
   │
   ▼
4. Build         (validation du compose + build des images Docker)
   │
   ▼
5. Deploy        (SSH production, branche main uniquement, environnement
                  `production` protégé par approbation)
```

### 11.2 Blocage du déploiement sur tests critiques

Le job `deploy` a `needs: [lint-typecheck, tests, build]`. GitHub Actions
n'exécute **jamais** un job dont un prérequis est en échec → un seul test
critique en échec (suite backend ou e2e) annule le build et le déploiement.
Le pipeline utilise `concurrency: ci-${{ github.ref }}` : un nouveau push
annule la run en cours de la même branche.

### 11.3 Secrets requis (Settings → Secrets and variables → Actions)

| Secret | Contenu |
| --- | --- |
| `SSH_HOST` | IP/domaine du serveur de production (ex. `203.0.113.10`) |
| `SSH_USER` | Utilisateur SSH (ex. `deploy`) |
| `SSH_PRIVATE_KEY` | **Clé privée SSH en base64** (`base64 -w0 ~/.ssh/id_ed25519`) |
| `SSH_DEPLOY_DIR` | Chemin du repo sur le serveur (défaut `/srv/cauto`) |
| `DEPLOY_PUBLIC_URL` | URL publique healthcheck (défaut `https://$SSH_HOST`) |

Sur le serveur, l'utilisateur `deploy` doit pouvoir faire `git pull` et
`docker compose up -d` sans mot de passe (clé publique autorisée dans
`~deploy/.ssh/authorized_keys`).

### 11.4 Application de la chaîne en local (équivalent CI)

```bash
# 1+2 — Lint + type check
cd backend && npm run lint && npm run typecheck

# 3 — Tests critiques
docker compose up -d postgres redis backend worker frontend reverse-proxy
docker compose exec -T backend npm run db:seed
cd backend && npm test
cd ../e2e && npx playwright test
```

### 11.5 Déploiement

- **Déclencheur** : `push` sur `main` (ou `workflow_dispatch` sur `main`).
- Le job `deploy` utilise l'environnement GitHub `production` : cochez la règle
  de protection « required reviewers » dans Settings → Environments si vous
  voulez une approbation manuelle avant chaque mise en production.
- La procédure SSH effectue : `git pull --ff-only` + `docker compose pull` +
  `docker compose up -d --force-recreate backend worker frontend reverse-proxy`
  puis un healthcheck `https://HOST/api/health`.
- En cas d'échec du healthcheck, le job échoue : les conteneurs précédents ne
  sont pas arrêtés, la prod reste sur l'ancienne version.

## 12. Sauvegardes & restauration testée (module 64)

### 12.1 Principe

Une sauvegarde **n'est pas réputée réussie parce qu'un fichier existe**.
Le module 64 impose : *conservation historique*, *stockage externe*, et surtout
**restauration testée** — on limite à zéro le scénario « on a un dump… qu'on ne
peut pas relire / restaurer ».

Deux scripts (Bash, Linux) :

| Script | Rôle |
| --- | --- |
| `deploy/backup.sh` | dump `pg_dump -Fc` + **validation** + rotation + stockage externe |
| `deploy/restore-test.sh` | **restauration réelle** dans une base jetable + comparaison à la source |

### 12.2 Ce que `backup.sh` valide (sinon exit ≠ 0)

1. le dump est **non vide** ;
2. **relisible** : `pg_restore --list` décode l'archive (format custom) ;
3. la carte (TOC) contient les **tables critiques** (`users`, `vehicles`,
   `garages`, `professionals`, `quotes`, `diagnostics`, `repair_orders`,
   `payments`) ;
4. **sha256** émis et déposé en side-car `*.dump.sha256` ;
5. si stockage externe configuré : PUT S3-compatible puis **HeadObject**
   (taille identique + checksum SHA256 demandé au serveur).

### 12.3 Conservation historique (rotation)

Chaque exécution (cron conseillé `0 2 * * *`) classe le snapshot :

- quotidien (chaque jour sauf règles ci-dessous) → garde `BACKUP_KEEP_DAILY` (7) ;
- **hebdomadaire** (dimanche) → garde `BACKUP_KEEP_WEEKLY` (5) ;
- **mensuel** (1er du mois) → garde `BACKUP_KEEP_MONTHLY` (6).

Soit jusqu'à 18 points de restauration simultanés. Rotation locale par compteur,
rotation distante par date d'objet (`BACKUP_REMOTE_KEEP=30` par défaut).

### 12.4 Stockage externe

Réutilise la passerelle **S3-compatible** des modules 59/60 (variables
`STORAGE_*`) : le dump est poussé vers `<bucket>/<STORAGE_PREFIX>/backups/`
via `backend/scripts/upload-backup.js` (AWS SDK déjà embarqué), **vérifié**
après PUT, et purgé selon `BACKUP_REMOTE_KEEP`. Recommandation prod : bucket
dans une **autre région / autre fournisseur** que le serveur (offsite).

### 12.5 Restauration testée

`./deploy/restore-test.sh [dump]` :

1. contrôle d'intégrité `sha256sum -c *.dump.sha256` ;
2. création d'une base jetable `cauto_restore_test_<rand>` ;
3. `pg_restore --exit-on-error` réel ;
4. **comparaison des compteurs** des tables critiques (source vs restauré) ;
5. destruction de la base jetable.

### 12.6 CI/CD

Le job `tests` du pipeline (§11) exécute désormais `backup.sh` +
`restore-test.sh` à chaque `push` : un backup illisible ou une restauration
incohérente **bloque le déploiement** (needs du job `deploy`).

### 12.7 Variables (`.env`) 

Voir `.env.example` §13 : `BACKUP_DIR`, `BACKUP_KEEP_DAILY/_WEEKLY/_MONTHLY`,
`BACKUP_REMOTE_KEEP`, `BACKUP_NOTIFY_URL` (webhook succès/échec)
+ réutilisation de `STORAGE_*`.

### 12.8 Exemple d'exécution

```bash
# Sauvegarde validée
BACKUP_DIR=/srv/cauto/backups ./deploy/backup.sh

# Restauration testée sur la dernière sauvegarde locale
BACKUP_DIR=/srv/cauto/backups ./deploy/restore-test.sh

# Restauration d'un dump précis
./deploy/restore-test.sh /srv/cauto/backups/cauto_20260831_daily.dump
```

## 13. Observabilité (module 65)

Architecture **extensible** : le serveur expose nativement logs structurés, métriques
Prometheus et disponibilité, sans dépendance externe obligatoire. Chaque outil
(Sentry, OpenTelemetry/Grafana, Datadog, Loki…) peut être branché **sans toucher
au serveur**, via la couche de hooks `backend/src/observability/telemetry.js`.

### 13.1 Endpoints livrés

| Endpoint | Rôle | Accès |
|----------|------|-------|
| `/health`, `/health/ready`, `/health/database`, `/health/redis` | Disponibilité réelle (db+redis), uptime, version, startTime ISO sur `/ready` | public |
| `/api/health` | Ancien agrégat `{status, app, db, redis}` (contract inchangé) | public |
| `/api/ops/info` | Détail runtime : version, env, uptime, mémoire RSS/heap, **latences p50/p95/p99** par route, état des alertes | public |
| `/api/ops/metrics` | Export **Prometheus** (`cauto_*` : `http_requests_total`, histogramme `http_request_duration_seconds`, gauges `health_ready`, `process_uptime_seconds`, `build_info`) | **Bearer `METRICS_TOKEN`** ; EN PROD, sans token → 404 |

Chaque réponse HTTP porte `X-Request-Id` et `X-Response-Time (ms)` (traçabilité).

### 13.2 Logs structurés (stdout)

JSON SLF4J-like par ligne sur stdout → collectés par le driver `json-file` de
Docker puis n'importe quel pipeline (Loki+Promtail, fluent-bit, Datadog…).
Niveaux : `debug|info|warn|error|fatal` (`LOG_LEVEL`). Un logger enfant par
requête propage `reqId/method/path` à toutes les sorties ; une ligne `http`
contenant durée (ms), statut, classes de statut, octets.

### 13.3 Watchdog disponibilité + alertes

`src/observability/alerts.js` sonde périodiquement db+redis (intervalle
`ALERT_CHECK_INTERVAL_MS`). Après `ALERT_UNHEALTHY_THRESHOLD` sondes dégradées
consécutives, il passe `healthy=false`, log une erreur, met la gauge
`cauto_health_ready` à 0 et **notifie** `ALERT_WEBHOOK_URL` (JSON
`{alert:"cauto_unhealthy", consecutiveFailures, detail}`). Le retour en santé
déclenche `cauto_healthy`. Le webhook est le branchement natif ; Grafana,
PagerDuty, OpsGenie… peuvent s'y substituer via `telemetry.use({onHealthChange})`
sans changer le serveur. `ALERT_ENABLED=false` désactive.

### 13.4 Démarrage d'un collecteur Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: cauto
    metrics_path: /api/ops/metrics
    bearer_token: <METRICS_TOKEN>
    scheme: https
    static_configs:
      - targets: ['api.cauto.bj:443']
```
(Target = votre hôte public, ex `api.cauto.bj:443` — adapter via `static_configs.targets`.)

### 13.5 Variables (`.env`)

`LOG_LEVEL`, `METRICS_ENABLED`, `METRICS_TOKEN`, `METRICS_PREFIX`,
`SERVICE_NAME`, `ALERT_ENABLED`, `ALERT_WEBHOOK_URL`,
`ALERT_CHECK_INTERVAL_MS`, `ALERT_UNHEALTHY_THRESHOLD` — cf. `.env.example`
(§14) et `deploy/.env.production.example` (§16).

### 13.6 Extension future (Sentry / OpenTelemetry)

Importer `src/observability/telemetry` et enregistrer des callbacks
(`use({ onError, onRequestFinish, onHealthChange, onShutdown })`) ; chaque
callback est isolé par try/catch, il ne peut jamais faire tomber l'application.
Aucune modification de `server.js` requise pour brancher un nouvel outil.