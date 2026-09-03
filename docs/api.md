# API — C-AUTO

Base : `/api` (convention). Toutes les routes `/api` passent par le rate-limit global puis la pagination automatique (`autoPagination`) puis `requireAuth` (sauf routes publiques).

## 1. Routes publiques

| Zone | Méthodes & chemins |
|---|---|
| Santé | `GET /health/` (db+redis+uptime), `GET /health/ready`, `GET /health/database`, `GET /health/redis`, legacy `GET /api/health/` |
| Config | `GET /api/config`, `GET /api/docs`, `GET /api/ui` |
| Geo | `GET /api/countries`, `/api/countries/default`, `/api/countries/:code`, `/api/countries/:code/regions`, `/api/countries/:code/cities`, `GET /api/currencies`, `GET /api/payment-methods` |
| Ops | `GET /api/ops/info` (public), `GET /api/ops/metrics` (**Bearer `METRICS_TOKEN`**) |
| Webhooks | `POST /api/payments/webhooks/payment` (secret `x-webhook-secret`) |
| Documents publics | `GET /api/documents/:id/public` (seulement `visibility=public`) |

## 2. Auth (`/api/auth`)

| Méthode & chemin | Protection |
|---|---|
| `POST /register`, `POST /login`, `POST /refresh` | `authLimiter` (20/15 min) |
| `POST /otp/request`, `POST /otp/verify` | `otpLimiter` (10/15 min) |
| `GET /me`, `PATCH /me`, `PATCH /me/locale`, `DELETE /me`, `POST /logout` | `requireAuth` |

Détail du flux : voir `docs/authentication.md`.

## 3. Comptes, véhicules, entretien

| Zone | Exemples |
|---|---|
| Véhicules `/api/vehicles` | `GET/POST /`, `GET/PATCH/DELETE /:id`, `GET /:id/history`, `GET /:id/maintenance`, `GET /:id/health-score`, `POST /:id/maintenance/records`, `GET /:id/passport` |
| Maintenance `/api/maintenance` | `GET /`, `GET /vehicle/:vehicleId` (propriétaire/GARAGE/MECANICIEN/ADMIN) |
| Problèmes `/api/issues` | `POST /` (pré-diagnostic auto) |
| Diagnostics `/api/diagnostic` | `GET /categories`, `POST /` (session), `GET /vehicle/:vehicleId` |
| Codes défaut `/api/fault-codes` | catalogue + causes/tests |
| Programmes `/api/maintenance` | programmes constructeur / C-AUTO, entretiens |

## 4. Matching & rendez-vous

| Zone | Exemples |
|---|---|
| Professionnels `/api/professionals` | `GET /` (recherche paged : q, city, specialty, min_rating, brand…), `GET /me`, `PATCH /me` (pro), `GET /:id`, `GET /:id/availability`, `GET /:id/stats` |
| Matching `/api/matching` | `GET /profiles`, `GET /results/:srId?profile=` |
| Service requests `/api/service-requests` | cycle complet : `POST /`, `POST /:id/match`, `POST /:id/select`, `POST /:id/accept`, `POST /:id/refuse`, `POST /:id/cancel`, `POST /:id/reception`, `POST /:id/validate-reception`, `POST /:id/start-diagnosis`, `GET /:id/history` |
| Rendez-vous `/api/appointments` | création/confirmation/annulation |

## 5. Interventions & paiement

| Zone | Exemples |
|---|---|
| Interventions `/api/interventions` | `GET /mine`, `GET /:id`, `POST /:id/diagnostic` (pro), `POST /:id/evidence` (pro, upload), `POST /:id/quote`, `POST /quotes/:quoteId/decision` (client), `POST /:id/extra-work`, `POST /extra-works/:extraId/decision`, `POST /:id/repair-order`, `POST /:id/tasks`, `POST /tasks/:taskId/done`, `POST /:id/quality-control`, `POST /:id/close` |
| Devis `/api/quotes` | `GET/POST /`, `GET/PUT /:id`, `POST /:id/approve|refuse`, `POST /:id/remise`, `POST /:id/evidences` |
| Paiements `/api/payments` | `GET /methods`, `GET /wallet`, `POST /wallet/topup` (sandbox), `POST /intent` (**en-tête `Idempotency-Key` requis**), `POST /:id/confirm` (sandbox), webhook public |
| Garanties `/api/warranties` | lecture (création automatique au succès du paiement) |
| Notes `/api/ratings` (+`/api/reviews`) | notation 1–5, recalcul de la note pro |

## 6. Pièces, flotte, admin

| Zone | Exemples |
|---|---|
| Pièces `/api/parts`, Fournisseurs `/api/suppliers` | catalogue, compatibilité, commandes, inventaire, livraisons (clients + espace fournisseur) |
| Flotte `/api/fleet` | chauffeurs, affectations, incidents/coûts, `GET /dashboard` (échéances par `maintenanceEngine.overview`) |
| Chat `/api/chat` | `GET/POST /conversations`, messages (polling), pièces jointes |
| Documents `/api/documents` | `POST /` (upload contrôlé), `GET /:id`, `GET /:id/download`, `PATCH/DELETE /:id` |
| Notifications `/api/admin/notifications` | perso (tous rôles) puis zone ADMIN requiert `requireRole('ADMIN')` |

## 7. Administration

- **Admin** `/api/admin` — `requireRole('ADMIN')` : `GET /dashboard`, `/stats`, `/users`, `/vehicles`, `/professionals` (+ verify/certify), `/suppliers`, `/service-requests`, `/commissions`, `/settings`, `/audit-logs` (permission `admin.audit.view`), maintenance-programs, fault-codes, `POST /broadcast`.
- **Super admin** `/api/super-admin` — gate `isSuperAdmin` + **`requireSuperConfirm`** sur les mutations : admins, permissions, settings critiques, pays, devises, intégrations, audit enrichi. Détail : `docs/authentication.md` et les rapports module 76.

## 8. Contrats transverses

- **Validation** : zod sur toutes les entrées (`backend/src/utils/validate.js`) → erreur `400 VALIDATION_ERROR` ; `express.json({ limit: '1mb' })`.
- **Pagination** : `?page=&limit=` (défaut page 1, limit 20, max 100 là où applicable), adapter par route.
- **Erreurs** : format JSON `{error, code, message, details?}` ; gestionnaire global (`server.js`) ne remonte jamais de stack trace au client.
- **Idempotence paiement** : `Idempotency-Key` (8–128) ; webhook dédupliqué par `event_id` (`payment_events` UNIQUE).
- **Traçabilité** : `X-Request-Id` (relayé ou généré), `X-Response-Time`, logs JSON avec `reqId`.
- **Audit** : actions sensibles journalisées dans `audit_logs` (immuable, secrets `[HIDDEN]`).