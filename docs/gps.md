# GPS — C-AUTO

## 1. Distance : haversine

`backend/src/services/gps/geo.js` — `haversineKm(aLat, aLng, bLat, bLng)` avec rayon terrestre `EARTH_R = 6371 km` et la formule standard (sin²(Δ/2), `2·R·asin(√s)`). `bearing(aLat,aLng,bLat,bLng)` donne le cap.

## 2. Routing (distance & durée)

`RoutingService.js` — mode selon l'environnement :

- `mode = DEMO_MODE ? 'simulated' : (ROUTING_PROVIDER || 'haversine')` ;
- configuré seulement si `!demoMode && ROUTING_API_URL && ROUTING_API_KEY` → appel externe de type **OSRM/GraphHopper** : `GET <ROUTING_API_URL>/<mode>/<lng,lat>;<lng,lat>?overview=false&generate_hints=false` avec `Authorization: Bearer <ROUTING_API_KEY>`. Si une route est trouvée : `distanceKm = r.distance/1000`, `durationMin = max(1, round(r.duration/60))`, `provider: 'external'`.

**Repli haversine / simulé** (par défaut) :

```js
straight      = haversineKm(from, to);
distanceKm    = round(straight * 1.3, 2);   // facteur route vs vol d'oiseau
speedKph      = opts.speedKph || 35;        // vitesse moyenne estimée
durationMin   = max(1, round(distanceKm / speedKph * 60));
```

## 3. ETA

`ETAService.estimate(from,to,opts)` → `{distanceKm, durationMin, speedKph, arrivalAt: now + durationMin*60000, provider}` (vitesse des options ou dérivée du taux).

## 4. Suivi de position (consentement)

`LocationService.js` :

- **consentement** requis (`gps_consents`) et session active (`gps_tracking_sessions`, `intervalSec` défaut 30) avant tout `ping()` ;
- `ping()` journalise `gps_tracking`, calcule le déplacement `haversineKm` ; si `moved > 0.05 km` → événements de zone entrée/sortie (`service_zones`, comparaison `haversineKm <= radius_km`) ;
- `deliverPosition` / `listPositions` : position **précise** réservée aux rôles privilégiés (`PRECISE_ROLES = ['ADMIN','SUPER_ADMIN','FLEET_MANAGER','LIVREUR']` + propriétaire), sinon **obfusquée**.

### Obfuscation

`obfuscate(lat, lng, blurDeg = 0.009)` — flou de grille ~1 km (`0.009° ≈ 1 km`, `accuracyHint = blurDeg*110 km`) pour les rôles non-privilégiés.

## 5. Routes /api/gps

| Méthode & chemin | Usage |
|---|---|
| `GET /api/gps/distance?from=lat,lng&to=lat,lng&mode=` | distance/durée (routeur choix) |
| `GET /api/gps/eta?from=&to=&speed_kph=` | arrivée estimée |
| `GET /api/gps/zones` | zones de service |
| `POST /api/gps/tracking/start \| stop \| ping` | cycle de suivi consenti |
| `GET /api/gps/vehicle/:id`, `GET /api/gps/vehicles` | positions (rôles privilégiés) |

## 6. Carte

`MAP_PROVIDER` + `MAP_API_KEY` documentent le fournisseur cartographique pour l'UI ; le calcul serveur n'en dépend pas (haversine/routing). En `DEMO_MODE`, toute la brique GPS est simulée (`mode: 'simulated'`).