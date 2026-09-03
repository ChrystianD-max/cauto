# Moteur d'entretien — C-AUTO

## 1. Règle « X km OU Y mois »

Le moteur (`backend/src/utils/maintenanceEngine.js`) applique une règle **OU** (la plus contraignante des deux conditions) :

```js
kmLeft  = dueKm  - mileage
daysLeft = Math.ceil((dueDate - now) / 86400000)
overdue = kmLeft <= 0 || daysLeft <= 0               // échéance atteinte
dueSoon = !overdue && (kmLeft <= 500 || daysLeft <= 30)
// statut : OVERDUE | DUE_SOON | OK
```

Seuils constants : **500 km** ou **30 jours** pour « bientôt due ».

> Les intervalles ne sont **pas codés en dur** : ils viennent de la table `maintenance_rules` (colonnes `interval_km`, `interval_months`). La fameuse règle *10000 km OU 12 mois* est une **donnée** (ex. Toyota Land Cruiser Prado — huile CONSTRUCTOR) ; d'autres contrôles ont des intervalles différents (15000/12, 20000/12, 100000/96 pour une courroie…). La provenance est `maintenance_sources` (`CONSTRUCTOR` vs `CAUTO`).

## 2. Calcul des échéances — `overview(vehicle)`

Pour chaque règle applicable (`make`/`model` correspondants, `NULL` = générique) :

1. **référence (baseline)** : dernière trace réelle `maintenance_records` (`type='ACTUAL'`, tri `done_at DESC, odometer_km DESC`) sinon baseline du véhicule (`initial_mileage ?? mileage`, `created_at`) ;
2. `dueKm = baseline.odometer_km + rule.interval_km` ;
3. `dueDate = baseline.done_at + rule.interval_months * MONTHS_MS` où `MONTHS_MS = 30.4375 * 24 * 3600 * 1000` (mois moyen).

Sortie : `program_constructor` (source `CONSTRUCTOR`), `recommendations_cauto` (source `CAUTO`), `alerts` (items non-OK), `score`, `all`.

**Score de santé** : `score = Math.max(40, 100 - 15*overdueCount - 5*soonCount)`.

`nextDue(vehicle)` renvoie la première échéance non-OK (tri ascendant par `km_left`).

## 3. Programme constructeur

`getManufacturerProgram(vehicle)` (`maintenanceEngine.js`) navigue `manufacturers → vehicle_models → vehicle_generations → engines → maintenance_programs` (programmes actifs, version la plus récente), puis charge `maintenance_intervals` avec les opérations agrégées (`maintenance_operations`) et contrôles (`maintenance_checks`).

## 4. Scan périodique du worker

Le service `worker` (`worker/index.js`, Node + pg + Redis) exécute **toutes les 60 s** :

1. `scanDueMaintenance()` : `CROSS JOIN maintenance_rules × vehicles`, en tenant compte de la dernière trace réelle par (véhicule, règle) ; sélectionne les lignes où `km_reference + interval_km <= mileage` **OU** `date_ref + interval_months <= now()` ;
2. pour chaque ligne : insertion de notification avec clé de dédup `due:<vehicle>:<règle>:<date ISO>` → `notifications` (UNIQUE `dedupe_key`), donc **au plus 1 notification par jour, règle et véhicule** ;
3. `redis.ping()` pour maintenir la connexion observée par `/api/health`.

Les échéances sont aussi calculées à la demande dans l'API (`routes/maintenance.js`, `routes/fleet.js` `GET /dashboard` qui agrège par score).

## 5. Moteur consommé par l'IA

Le fournisseur de règles (`backend/src/services/ai/providers/rules.js`) implémente `maintenance()` en appelant `maintenanceEngine.overview` et en produisant un `decision` déterministe ; un fournisseur LLM externe ne pourrait qu'ajouter un *insight* sans jamais décider.

## 6. Cycle de validation dans le parcours

Après une intervention : paiement réussi → garantie 12 mois → historique mis à jour (immuable) → notation → **prochaine échéance recalculée** à la déclaration d'un entretien (enregistrement `type='ACTUAL'`).