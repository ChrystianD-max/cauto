# Moteur de matching — C-AUTO

## 1. Principe

`backend/src/utils/matchingEngine.js` calcule pour chaque professionnel un **score pondéré** (0–100) face à une demande de service. Les **poids viennent de la base** (table `matching_profiles`, profils nommés, ex. `STANDARD`) : colonnes `weight_brand`, `weight_problem`, `weight_quality`, `weight_satisfaction`, `weight_delay`, `weight_price`, `weight_distance` — pas de constantes en dur.

Score final :

```js
finalScore = weight_brand * brandScore
           + weight_problem * problemScore
           + weight_quality * qualityScore
           + weight_satisfaction * satisfactionScore
           + weight_delay * delayScore
           + weight_price * priceScore
           + weight_distance * distanceScore;
```

`score = Math.round(finalScore * 100) / 100`, tri **descendant** (meilleurs en tête).

## 2. Les 7 sous-scores

| Sous-score | Formule |
|---|---|
| `brandScore` | 100 si `professional_brands` contient exactement la marque ; 30 via « Toutes marques » ; 0 sinon |
| `problemScore` | 100 si un `professional_services.category === sr.category` ; 50 si correspondance partielle de chaîne (dans un sens ou l'autre) ; **20 par défaut** |
| `qualityScore` | `(pro.rating / 5) * 100` |
| `satisfactionScore` | `pro.satisfaction_rate || 0` |
| `delayScore` | `max(0, 100 - (pro.avg_delay_days || 0) * 10)` |
| `priceScore` | normalisation min/max du prix moyen des services : `100 - ((prixPro - min) / (max - min) * 100)` ; 50 si données absentes ou prix égaux |
| `distanceScore` | `max(0, 100 - distance * 10)` où `distance = sqrt((Δlat)² + (Δlng)²)` en **degrés euclidiens** (pas haversine — c'est le calcul retenu par le matching) |

API : `getMatchingProfiles()`, `updateMatchingProfile(id, weights)`, `calculateScore(professionalId, serviceRequestId, profileName)`.

## 3. Cycle d'une demande de service

1. Client crée la demande : `POST /api/service-requests` ;
2. Matching : `POST /api/service-requests/:id/match` appelle `matchProfessionals(srId, 'STANDARD')`, stocke les résultats (JSON) dans `service_requests.matched_professionals`, passe le statut `MATCHING` et journalise l'historique ;
3. Consultation : `GET /api/matching/results/:srId?profile=` ;
4. Sélection : `POST /api/service-requests/:id/select` fixe `professional_id`, `selected_professional_at`, statut `PROFESSIONAL_SELECTED`.

## 4. Recherche de professionnels (API publique)

`GET /api/professionals` :

- Filtres : `q` (nom/spécialité ILIKE), `city`, `specialty`, `profile_type`, `min_rating` (`p.rating >=`), `brand` (sous-requête `professional_brands`), `available=true` (`is_active`), pagination (page 1, limit 20, max 100).
- Triage : par défaut `rating DESC` ; `?sort=delay` → `avg_delay_days ASC`.

## 5. Données de qualité pro (pour l'évaluation)

`professionals` porte `rating`, `rating_count`, `satisfaction_rate`, `avg_delay_days`, `complaint_rate`, `return_rate`, `is_certified`, `verification_status`, `profile_type` ; les notes (`ratings`, 1–5 étoiles) recalculent `rating` au fil des interventions. Le tout alimente `qualityScore`/`satisfactionScore`/`delayScore`.