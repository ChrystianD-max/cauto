# Règle anti-mock — Module 67

**Projet** : C-AUTO — Backend Express + Postgres 16 + Redis
**Version** : documentation de règle de développement + vérificateur CI
**Fichier de contrôle** : `backend/scripts/check-anti-mock.js` (check CI bloquant, module 67, exécuté via `npm run check:antimock`)

---

## Règle

> **Un tableau / Map / Set de données statique ne peut JAMAIS remplacer la base de
> données.** Les données métier doivent être stockées dans Postgres (tables du
> schéma `db/init.sql` + migrations `db/migration_v*.sql`) et lues via les
> repositories/services.

Les seules zones où des données « simulées » sont **autorisées** :

| Zone | Autorisation | Preuve |
|---|---|---|
| **Tests** (`backend/tests/**`, `*.test.js`, `*.spec.js`) | Mocks / fixtures autorisés | hors de la vérification CI |
| **Mode démo** (`DEMO_MODE`) | `config.demoMode` fige les intégrations externes en mode simulé | `backend/src/config.js:54` ; OTP « demo » `backend/src/routes/auth.js:95` |
| **Paiement non configuré** | `PaymentProvider.isTestMode()` = `demoMode` OU `PAYMENT_MODE=sandbox` OU `!isConfigured()` | `backend/src/services/payment/PaymentProvider.js:26` |
| **Canal d'intégration externe non renseigné** | canal de notification console renvoie `{ delivered:true, synthetic:true }` | `backend/src/services/notifications/channels.js:22` |

## Interdit

> Une dépendance **statique** `const <nom de table métier> = [...]` (ou `new Map()`,
> `new Set()`) déclarée **au niveau module** dans `backend/src/` — c'est une fausse
> base de données en mémoire qui ne persiste pas et contourne le schéma SQL.

Exemple **interdit** :

```js
// ❌ INTERDIT — « vehicles » est une table métier réelle (db/init.sql)
//    mais elle est remplacée ici par un tableau en mémoire :
const vehicles = [
  { id: 1, plate: 'AA-123-BB' },
  { id: 2, plate: 'CC-456-DD' },
];
```

Remplacement **exigé** : requête SQL via le service/repository (`db(...)`), lecture
réelle de la table Postgres.

## Vérification CI (auto)

`npm run check:antimock` (ou `node backend/scripts/check-anti-mock.js`) :
- Parcourt `backend/src/**/*.js` (hors `.test.js` / `.spec.js`) ;
- Détecte les déclarations **top-level** `const|let <nom> = [...] / = new Map() / = new Set()`
  dont le nom (en minuscules) correspond à une **table métier** du mapping intégré
  (100+ tables extraites de `db/init.sql` + migrations : `users`, `vehicles`,
  `service_requests`, `interventions`, `quotes`, `repair_orders`, `payments`, …) ;
- Ignore les constantes d'énumération en **MAJUSCULES** (`ROLES`, `ORDER_STATUS`, …) ;
- **Exit 1 (bloque la PR)** dès la première violation.

## Audit du code actuel (au moment de la rédaction)

**Aucune violation.** Les seuls tableaux/Map de `backend/src` sont :
- Constantes d'énumération/config (`ROLES`, `ALLOWED_MIME`, …) ;
- Mappings de domaine (catégories, i18n) ;
- Accumulateurs **locaux** de fonctions alimentés par de **vraies requêtes DB**
  (ex. `maintenanceEngine.js` — `items` construit à partir de résultats SQL, pas un stock).

Résultat réel du vérificateur :

```
[anti-mock] OK — aucun tableau/Map statique ne remplace la base de données dans src/
            (0 violation, 0 avertissement).  →  exit 0
```

Vérifié aussi avec un **probe** (fichier factice `const vehicles = [...]`) → le
vérificateur a bien renvoyé `exit 1` (`VIOLATION`) puis le probe a été supprimé.
