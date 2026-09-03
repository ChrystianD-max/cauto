# Tests — C-AUTO

## 1. Suites existantes

| Suite | Outil | Emplacement | Commande |
|---|---|---|---|
| Backend (unitaires + intégration API) | `node --test` | `backend/tests/*.test.js` | `cd backend && npm.cmd test` |
| E2E (parcours + responsive + deployment + pwa + fournisseur + certifie) | Playwright | `e2e/specs/` | `cd e2e && npx.cmd playwright test` |
| Lint ESLint + type check | eslint 9 / tsc | config la racine backend | `cd backend && npm.cmd run lint` / `typecheck` |

État de référence : **125 tests backend, 0 échec** ; lint des fichiers nouveaux à 0 warning/0 erreur.

## 2. Backend — conventions (`backend/tests/helpers.js`)

- S'adresse à l'API **réelle** via HTTPS auto-signé (`baseURL https://localhost`) ;
- connexion de test à une base jetable (`TEST_PG_URL`) ; mot de passe de test commun `Test1234!` ;
- `register()`/`login()` retournent `{ token, ... }` ; `api()` retourne `{ status, data }` ;
- rate-limits relevés dans `.env` pour laisser passer les suites (et CI : `RATE_LIMIT_*` élevés — voir `.github/workflows/ci.yml`) ;
- suppression des utilisateurs de test parfois bloquée par FK `audit_logs_actor_id_fkey` (immutabilité) — comportement attendu.

Domaines couverts : auth/OTP/refresh, RBAC/permissions, super-admin (console + confirmation renforcée), véhicules, maintenance (règle OR « 10 000 km OU 12 mois »), diagnostics DTC, devis/interventions/qualité/clôture, paiements (idempotence, webhook dédupliqué, garantie), ratings, matching, chat, documents/upload, pays/devises/intégrations, audit, observabilité (`/health/ready`, Prometheus protégé), sauvegarde/restauration.

## 3. E2E Playwright

`e2e/playwright.config.js` : `baseURL https://localhost`, `ignoreHTTPSErrors: true`, canal **Chrome** (`channel:'chrome'`), workers séquentiels, trace « on-first-retry ».

| Projet | Fichiers dédiés |
|---|---|
| `parcours` | `parcours-complet.spec.js` (scénario 23 étapes) |
| `deployment` | `deployment.spec.js` |
| `pwa` | `pwa.spec.js` |
| `fournisseur` | `fournisseur.spec.js` |
| `responsive` | `responsive.spec.js` |
| `certifie` | `certifie.spec.js` |

Installation des navigateurs : `npx.cmd playwright install --with-deps chrome`.

## 4. Pipeline CI/CD (`.github/workflows/ci.yml`)

Chaîne bloquante : **Lint+Typecheck → Tests → Build → Deploy** (branche `main`).

Job `lint-typecheck` : eslint, `tsc --noEmit`, `check:antimock`, `check:nofakebuttons`, et (module 81) `db:check` (politique migrations).

Job `tests` (gate du déploiement) :
1. stack dockérisée (`postgres redis backend worker frontend reverse-proxy`) — schéma au premier boot via `db/init.sql` ;
2. seeds (hôte, car l'image backend ne contient pas `db/`) : `npm run db:seed` ;
3. healthcheck `https://localhost/api/health` ;
4. suite backend `npm test` ;
5. observabilité : `/health/ready`, `X-Request-Id`, `/api/ops/info`, Prometheus **401 sans token / 200 avec** ;
6. Playwright (install Chrome, `npx playwright test`) ;
7. sauvegarde + restauration testée : `./deploy/backup.sh` puis `./deploy/restore-test.sh` ;
8. artefacts des traces en cas d'échec.

Job `build` : `docker compose config --quiet` + `docker compose build backend worker frontend`. Job `deploy` : SSH (`git pull` + `compose up -d`) + healthcheck public post-deploy.

## 5. Vérifier la conformité

```bash
cd backend
npm.cmd run lint          # eslint src/ tests/ scripts/ seed/
npm.cmd run typecheck     # tsc --noEmit
npm.cmd run db:check      # politique migrations (module 81)
npm.cmd test              # suite complète backend
cd ../e2e && npx.cmd playwright test
```

## 6. Règle finale

> Ne jamais déclarer C-AUTO « prêt » simplement parce que l'interface s'affiche — la validation repose sur la checklist complète, la suite backend et le scénario E2E intégral.