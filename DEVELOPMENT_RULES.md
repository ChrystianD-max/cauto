# C-AUTO — RÈGLE DE DÉVELOPPEMENT (module 66)

**Règle** : pour **chaque** fonctionnalité, la chaîne suivante doit être parcourue et
**prouvée** avant que la fonctionnalité ne soit déclarée terminée :

```
UI
↓
API
↓
SERVICE MÉTIER
↓
DATABASE
↓
TEST
```

> **Une fonctionnalité n'est terminée que lorsque les 5 maillons fonctionnent
> ensemble.** Un maillon manquant ou « en attente » = fonctionnalité NON livrée,
> quelle que soit la qualité des autres couches.

---

## 1. Les 5 maillons — rôles et emplacements dans le repo

| # | Maillon | Rôle | Emplacements C-AUTO |
|---|---------|------|---------------------|
| 1 | **UI** | Parcours utilisateur réel, rendu, états, navigation (SPA `#/route`) | `frontend/www/app/*` (`app-v8.js`, `views-*.js`, `app-i18n.js`, `styles.css`, `index.html`) |
| 2 | **API** | Contrat HTTP : routes, validation d'entrée (zod), autorisation, réponse JSON | `backend/src/routes/*.js` (+ `middlewares/auth.js`, `utils/errors.js`) |
| 3 | **SERVICE MÉTIER** | Logique métier réutilisable, sans Express : moteurs, gestionnaires, fournisseurs | `backend/src/utils/*Engine.js`, `backend/src/services/**` (`PaymentManager`, `NotificationService`, `matchingEngine`, `maintenanceEngine`, `diagnosticService`…) |
| 4 | **DATABASE** | Modèle de données, schéma, migrations, contraintes, index | `db/init.sql` + `db/migration_v*.sql`, seeds `db/seed_v*.sql` |
| 5 | **TEST** | Preuve que tout fonctionne ensemble, automatisé et bloquant | `backend/tests/*.test.js` (node --test, API+) + `e2e/specs/*.spec.js` (Playwright, UI) |

---

## 2. La liaison entre les maillons (comment elles se prouvent)

Le strict minimum pour déclarer « terminé » :

1. **UI ↔ API** : l'écran appelle la vraie route (pas de mock), gère les états
   succès/erreur/chargement. → prouvé par les specs **e2e** (`e2e/specs`) qui passent
   par le navigateur **et** le proxy/API réel.
2. **API ↔ SERVICE MÉTIER** : la route délègue la logique à un `*Engine`/service
   (pas de logique métier inline duplicative). → prouvé par **lint** (pas de
   blocage) + revue de code + tests unitaires des moteurs.
3. **SERVICE MÉTIER ↔ DATABASE** : le moteur lit/écrit via `db` (pg pool).
   → prouvé par les **tests backend** qui exécutent de vraies requêtes en base.
4. **DATABASE** : schéma/contraintes présents dans `db/init.sql`/migrations, appliqués
   au boot compose, seedé. → prouvé par le démarrage réel de la stack + backup relu.
5. **TEST critique (gate)** : la fonctionnalité a son test automatisé
   (`backend/tests/*.test.js` et/ou spec e2e) **et** ce test est vert dans le CI ;
   le CI **bloque** le déploiement si un test critique échoue (modules 63/64).

**Gate CI** (`.github/workflows/ci.yml`) : job `tests` = `npm test` (81 tests
backend) + **e2e Playwright (35 specs)** + backup/restauration + observabilité.
Tout échec ⇒ `deploy` bloqué (`needs: [lint-typecheck, tests, build]`).

---

## 3. Exemple fil rouge — « Devis d'intervention » (trace des 5 maillons)

| Maillon | Preuve concrète dans le repo |
|---|---|
| **UI** | Navigation `#/pro/quotes`, `#/quotes/:id`, vues `viewProQuotes()` / `viewQuoteDetail()` dans `frontend/www/app/app-v8.js:115,1286-1287` |
| **API** | `backend/src/routes/quotes.js` : `GET /` (31), `POST /` (65), `GET /:id` (111), `POST /:id/approve` (162), `POST /:id/refuse` (205), `POST /:id/remise` (238), `POST /:id/evidences` (311) — validation/contrats HTTP |
| **SERVICE MÉTIER** | règle « un seul devis par intervention » + totale (items, remise) dans la route, déléguée aux requêtes métier/`PaymentManager` pour le règlement |
| **DATABASE** | `db/init.sql:153` `CREATE TABLE quotes` + `:163` `quote_items` ; écritures réelles `INSERT INTO quotes (…, total_cents, original_total_cents, created_by, …)` (routes/quotes.js:79) |
| **TEST** | `backend/tests/quotes.test.js` (création + total correct, refus avec motif, remise puis approbation, refus sans motif 400, **double création rejetée 409**, travaux supplémentaires) + `e2e/specs/parcours-complet.spec.js` (étapes 3→9 : devis vu et approuvé via UI) |

> Résultat observé : suite backend `quotes` 7/7 verts + parcours e2e complet vert.

---

## 4. Autres traces (fil rouge transverse)

### 4.1 Matching / sélection d'un garage
- **SERVICE MÉTIER** : `backend/src/utils/matchingEngine.js` — `matchProfessionals()`
  (score marque/besoin) + `getMatchingProfiles()`.
- **API** : `backend/src/routes/matching.js` (`GET /profiles`, `GET /results/:srId`).
- **UI** : bouton **#btn-match-sr** + sélection de pro (spec e2e « flux de matching via UI »).
- **TEST** : `backend/tests/matching.test.js` (score décroissant, marque exacte) +
  e2e étapes 3/11.

### 4.2 Paiement (garantie + historique)
- **SERVICE MÉTIER** : `backend/src/services/payment/PaymentManager.js` +
  `providers/{card,wallet,mobileMoney,cash}.js` + unit-test per provs.
- **API** : `backend/src/routes/payments.js` (Idempotency-Key requis, statuts).
- **DATABASE** : tables garantie/historique (init + module 64 backup : `payments` 164 lignes).
- **TEST** : `backend/tests/payments.test.js` 6/6 (intention 400 sans idempotence, succès,
  **idempotence même clé = même paiement**, wallet remboursement, tiers 403, 409).

### 4.3 Maintenance préventive
- **SERVICE MÉTIER** : `backend/src/utils/maintenanceEngine.js` — `statusFor()`
  (règle km OU temps → `OK/DUE_SOON/OVERDUE`), `overview()`, `nextDue()` ; tests **unitaires** purs dans `maintenance.test.js`.
- **API** : `backend/src/routes/maintenance.js` (intervalle constructeur, enregistrement `ACTUAL`, droits pro).
- **UI** : console intervention/maintenance affichant l'échéance.
- **TEST** : `backend/tests/maintenance.test.js` (unitaires `statusFor` + intégration intervalle/ACTUAL/propriété 403/admin).

### 4.4 Observabilité (module 65, dernier livré)
- **API** : `backend/src/routes/ops.js` (`/api/ops/info`, `/api/ops/metrics` protégé) +
  `routes/health.js` (`/health/ready`).
- **SERVICE MÉTIER** : `backend/src/observability/` (`logger`, `metrics`, `telemetry`,
  `http`, `alerts`).
- **TEST** : `backend/tests/observability.test.js` 9/9 + **étape bloquante dédiée en CI**
  (401 sans token / 200 avec, `/ready`, `X-Request-Id`).

---

## 5. Règle en pratique — définition de « terminé »

Pour livrer une fonctionnalité, appliquer cette matrice. ⚠ = non terminé.

| Fonctionnalité | UI | API | Service métier | Database | Test | Statut |
|---|---|---|---|---|---|---|
| Utilisateur/inscription (34) | ✔ | ✔ | ✔ (auth) | ✔ | ✔ | **terminé** |
| Véhicules | ✔ | ✔ | ✔ | ✔ | ✔ | **terminé** |
| Devis/interventions | ✔ | ✔ | ✔ | ✔ | ✔ | **terminé** |
| Paiement | via API | ✔ | ✔ (PaymentManager) | ✔ | ✔ | **terminé** |
| Maintenance | ✔ | ✔ | ✔ (maintenanceEngine) | ✔ | ✔ | **terminé** |
| Matching | ✔ | ✔ | ✔ (matchingEngine) | ✔ | ✔ | **terminé** |
| Certification | ✔ | ✔ | ✔ | ✔ | ✔ | **terminé** |
| Observabilité (65) | — | ✔ | ✔ (observability) | ✔ | ✔ | **terminé** |
| *(exemple*) | ✘ | ✔ | ✔ | ✔ | ✔ | **⚠ NON terminé** (manque l'UI) |
| *(exemple*) | ✔ | ✔ | ✘ (logique inline) | ✔ | ✔ | **⚠ NON terminé** (pas de service) |
| *(exemple*) | ✔ | ✔ | ✔ | ✔ | ✘ (pas de test) | **⚠ NON terminé** (pas de gate) |

> Un test est **obligatoire** : les bugs critiques (respect des règles métier,
> droits, idempotence, immuabilité) sont verrouillés par `backend/tests/*.test.js`,
> et le parcours utilisateur par les specs e2e. Sans test vert, le CI bloque le deploy.
>
> **Cas particulier** : les fonctionnalités purement **infra/serveur** (ex.
> observabilité, backups, CI/CD, HTTPS) n'ont volontairement **pas** de surface UI.
> La règle s'y applique réduite : **API + Service métier + Database + Test** (les
> 3+ maillons applicables) **+ gate CI bloquant**. Aucune d'elles ne peut être
> livrée sans son test exécuté et vert.

---

## 6. Checklist de livraison (à joindre à chaque PR / rapport)

- [ ] **UI** : le parcours existe et est navigable (hash `#/…`, vue, états succès/erreur).
- [ ] **API** : la route est définie (méthode + path + validation entrée + autorisation).
- [ ] **SERVICE MÉTIER** : la logique réutilisable est dans un `*Engine`/service, pas dupliquée inline.
- [ ] **DATABASE** : le schéma/contraintes sont dans `db/init.sql` ou une migration `db/migration_v*.sql`, appliquée au boot.
- [ ] **TEST** :
  - [ ] tests backend (`backend/tests/*.test.js`) verts (au moins 1 cas par règle métier/droit) ;
  - [ ] le cas échéant, spec e2e (`e2e/specs/*.spec.js`) verte ;
  - [ ] `npm run lint` (0 erreur), `npm run typecheck` (0) ;
  - [ ] le CI passe (job `tests` = gate de `deploy`).
- [ ] **Docs** : variables ajoutées à `.env.example` (+ `.env.production.example` si prod),
      rapport `RAPPORT_TEST_*.md` écrit.

---

## 7. Source de la règle

Issue / décision de la roadmap, retranscrite au début de ce document. Cette règle
s'applique rétroactivement à tout nouveau travail (modules 66+) et aux correctifs :
aucun correctif n'est « expédié » sans ses deux preuves (test automatique + CI vert).
