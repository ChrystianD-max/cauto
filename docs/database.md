# Base de données — C-AUTO

## 1. Vue d'ensemble

PostgreSQL 16, base `cauto` (user `cauto`), extension `pgcrypto`. Connexion via `DATABASE_URL` (`postgresql://cauto:cauto@postgres:5432/cauto` en compose). Le schéma est versionné dans `db/` :

- `db/init.sql` — socle (tables coeur, enum, triggers) ;
- `db/migration_v2.sql` … `db/migration_v21_superadmin.sql` — **20 migrations versionnées** ;
- `db/seed_v3.sql`, `db/seed_v4.sql` — données de référence (pays, services, permissions…) ;
- registre d'application : table `schema_migrations(version, applied_at)`.

## 2. Groupes de tables

| Groupe | Tables principales |
|---|---|
| Comptes & RBAC | `users` (colonne enum `role`), `roles`, `permissions`, `role_permissions`, `user_roles`, `user_profiles` |
| Véhicules & entretien | `vehicles`, `maintenance_rules`, `maintenance_records`, `maintenance_alerts`, `vehicle_history` |
| Programmes constructeur | `manufacturers`, `vehicle_models`, `vehicle_generations`, `engines`, `maintenance_programs`, `maintenance_program_versions`, `maintenance_intervals`, `maintenance_operations`, `maintenance_checks`, `maintenance_sources` |
| Parcours mécanicien | `issues`, `prediagnostics`, `appointments`, `interventions`, `diagnostics`, `diagnostic_sessions`, `evidences`, `quotes`, `quote_items`, `quote_evidences`, `extra_work_requests`, `repair_orders`, `tasks`, `repair_items`, `quality_checks`, `repair_trace` |
| Service requests & matching | `service_requests`, `service_request_history`, `matching_profiles`, `professional_matches` |
| Paiements & garanties | `payments`, `payment_events`, `cauto_wallets`, `commissions`, `transactions`, `invoices`, `warranties` |
| Notes & litiges | `ratings`, `disputes`, `dispute_messages`, `second_opinions` |
| Pièces & fournisseurs | `suppliers`, `parts`, `part_compatibility`, `part_orders`, `order_items`, `inventory`, `deliveries` |
| Flotte | `fleet_drivers`, `fleet_vehicle_assignments`, `fleet_incidents`, `fleet_costs`, `fleet_accounts`, `fleet_vehicles`, `fleet_events` |
| Codes & DTC | `fault_code_systems`, `fault_codes`, `fault_code_causes`, `fault_code_tests` |
| Notifications & chat | `notifications`, `notification_deliveries`, `conversations`, `conversation_members`, `messages` |
| Geo / i18n / config | `currencies`, `countries`, `regions`, `cities`, `payment_methods`, `app_settings`, `integrations` |
| Sécurité & audit | `refresh_tokens`, `otp_codes`, `audit_logs` |
| Documents | `document_storage`, `vehicle_documents` |
| Multi-entités (v20) | `tenants`, `tenant_memberships`, `vehicles.tenant_id` |
| GPS (v10/v12) | `gps_tracking`, `gps_consents`, `gps_tracking_sessions`, `service_zones` |

## 3. Immutabilité (append-only)

La fonction `forbid_mutation()` (`db/init.sql`) lève une exception sur `UPDATE`/`DELETE` et protège :

- `history_entries` (historique véhicule)
- `audit_logs` (journaux d'audit)
- `warranties` (garanties)
- `repair_trace` (trace de réparation)

Conséquence : la suppression d'un utilisateur ayant des lignes d'audit échoue par FK `audit_logs_actor_id_fkey` — comportement attendu, pas une erreur.

L'écriture de l'audit est gérée par `backend/src/middlewares/audit.js` (`audit`, `auditChange`), avec **redaction automatique** des secrets (`[HIDDEN]` sur password/secret/token/refresh).

## 4. Politique des migrations (module 81)

> **TOUTE modification de base passe par une migration versionnée.**
> Interdit en production : modification manuelle non documentée (ALTER/CREATE/DROP ad hoc via psql ou script one-shot).

| Règle | Détail |
|---|---|
| Nouvelle évolution | Créer `db/migration_v<N>_description.sql` avec `N` = dernière version + 1 (séquence sans trou, pas de doublon) |
| Application | Uniquement via `npm run db:migrate` (runner `backend/scripts/db-migrate.js`) : exécute `init.sql` si absent puis les `migration_v*.sql` non enregistrés, dans l'ordre, dans une transaction par fichier |
| Registre | Chaque version appliquée est inscrite dans `schema_migrations` ; re-exécution idempotente |
| Seeds | Ne doivent contenir que des données (INSERT) — **aucun DDL** |
| Garde-fou | `npm run db:check` (`backend/scripts/check-migrations.js`) vérifie la convention (noms, séquence, interdiction de DDL dans les seeds) et bloque la PR via la CI (`.github/workflows/ci.yml`) |
| Production | Aucune commande psql manuelle ; toute évolution = nouvelle migration revue puis appliquée par le pipeline |

Rappel SQL : PostgreSQL tourne avec `standard_conforming_strings=on` → échapper les apostrophes par `''` (jamais `\'`).

## 5. Connexions & contexte applicatif

Le pool pg (`backend/src/db.js`) expose `db.tx(async c => …)` pour les transactions (utilisées massivement par le seed et le domaine paiement). Les `enum` PostgreSQL (`user_role`, etc.) contraignent les valeurs côté base (ex. nombres `status`).