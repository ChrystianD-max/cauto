# Règle de gestion des erreurs — Module 69

**Projet** : C-AUTO — Backend Express + Postgres 16 + Redis
**Version** : convention de code appliquée + couverte par les tests backend
**Fichier de contrôle** : continué par `backend/tests/errors.test.js` (exécuté avec la suite `npm test`)

---

## Règle

> **Toute réponse d'erreur d'API MUST renvoyer un objet `{ success:false, error:{ code, message } }`**
> — jamais une stack trace au client, ni une erreur 5xx sans code ; jamais une
> réponse 2xx marquée `success:false`.

Format **ETALON** (norme, produit par `errorBody()`) :

```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Route introuvable" }
}
```

Pour **rétro-compatibilité**, le même objet inclut AUSSI les champs à plat
historiques `code` / `message` (et `details` si présent) :

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Données invalides", "details": [...] },
  "code": "VALIDATION_ERROR",
  "message": "Données invalides",
  "details": [...]
}
```

## Codes dérivés par statut HTTP (dans `errorBody`)

| Statut | Code machine |
|---|---|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED` |
| 409 | `CONFLICT` |
| 410 | `GONE` |
| 413 | `PAYLOAD_TOO_LARGE` |
| 415 | `UNSUPPORTED_MEDIA` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `RATE_LIMITED` |
| autre / défaut | `ERROR` |

Un code **domaine** (ex : `VEHICLE_NOT_FOUND`) peut être passé en 3ᵉ argument
pour enrichir le code par défaut.

## Interdit

- **Exposer `err.stack`, `err.message` brut d'une exception 5xx** au client →
  remplacer par `safeMessage(err)` : un message qui ressemble à une stack trace
  (`at <fn> (…)` / `\n  at …`) est remplacé par « Erreur interne ».
- **Renvoyer `error` sous forme de simple string** (ancien format) → la norme
  impose `error` comme **objet** `{ code, message }` (le frontend lit `data.error.message` / `data.error.code`).
- **Une réponse 5xx sans objet structuré** → le middleware final renvoie
  `500` / `INTERNAL` / « Erreur interne », quel que soit le statut `isProduction`.

## Implémentation (points d'ancrage)

| Point | Fichier |
|---|---|
| Helper `errorBody()` + `safeMessage()` + `STATUS_CODES` | `backend/src/utils/errorResponse.js` |
| 404 + middleware d'erreur unifié (HttpError, ZodError→`VALIDATION_ERROR`, 4xx→« REQUEST_ERROR », 5xx→`INTERNAL`) | `backend/src/server.js` (lignes ~85-108) |
| Conversion des réponses ad-hoc → `errorBody()` | `backend/src/routes/auth.js` (refresh_token manquant→400), `backend/src/routes/ops.js` (`NOT_FOUND`, `METRICS_UNAUTHORIZED`) |
| Frontend : lecture des deux formats (`data.error.message`/`data.error.code` sinon `data.code`/`data.error`) | `frontend/www/app/app-v8.js` — helper `api()` + `errFromHttp` (lignes ~39-61) |
| Tests de conformité (format + pas de stack) | `backend/tests/errors.test.js` (6 tests) |

## Frontend — lecture d'erreur (`errFromHttp`)

L'`api()` du frontend accepte les **deux** formats afin de préserver la
rétro-compat : `data.error` **objet** (`{message}`) à priorité, sinon `data.error`
**string**, sinon vide. `errFromHttp(data)` renvoie le message lisible ; le code
machine est pris dans `data.error.code` puis repli `data.code`.

## Vérification

Couvert par la suite backend (`npm test`) :
- `backend/tests/errors.test.js` — 401→`UNAUTHORIZED`, 404 route→`NOT_FOUND`,
  404 véhicule→`NOT_FOUND`, 403 inter-utilisateur→`FORBIDDEN`,
  validation 400→`VALIDATION_ERROR`, et **aucune réponse 2xx ne porte `success:false`** ;
  plus un helper `assertNoStack` vérifiant l'absence de stack trace en sortie.
- Suite totale : **87/87 tests, 0 erreur** (lint 0 erreur / 61 warnings, typecheck 0 erreur).

## Audit du code actuel

Toutes les erreurs non gérées sont normalisées par le middleware (404 + erreur)
de `server.js`. Aucune stack trace n'est exposée hors `isProduction=false` avec
`safeMessage()` filtrant les messages « comme une stack ». Les réponses ad-hoc
résiduelles des routes `auth`/`ops` ont été converties au format structuré. Les
endpoints de **santé infra** (`health.js`, 503 degraded) restent hors du format
métier volontairement.