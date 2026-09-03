# Moteur de diagnostic — C-AUTO

## 1. Architecture : règles d'abord, IA en second

Le diagnostic engageant est **toujours déterministe** (`backend/src/services/ai`). Un fournisseur LLM externe, s'il est configuré (`AI_PROVIDER=openai|anthropic`), n'ajoute qu'une couche *insight* explicative — il **ne peut pas contredire** la décision du moteur de règles (« ne pas contredire » est une contrainte de prompt). En `DEMO_MODE` ou sans clé, le fournisseur de règles est toujours utilisé.

## 2. Catégories de symptômes

`backend/src/utils/diagnosticService.js` — 12 catégories (clés françaises) avec `keywords[]` et `base_causes[]` :

`moteur, boite, embrayage, freinage, direction, suspension, climatisation, batterie, electricite, pneus, voyant, bruit, autre`.

`extractCategory(text)` : minuscule → comptage d'occurrences de mots-clés par catégorie → catégorie au score max (défaut `autre`).

## 3. Analyse — `analyseSymptoms(text, category, dtcCodes, vehicleHistory)`

1. **Résolution des DTC** : `dtc.resolve(dtcCodes)` (`src/utils/dtcKnowledge.js`) ; causes/tests dédupliqués par libellé en gardant la probabilité max, tri par probabilité décroissante.
2. **Urgence** :
   - `HAUTE` si le texte contient `surchauffe | fumée | perde | ne démarre | abs` **ou** un DTC `severityMax === 'CRITIQUE'` ;
   - `MOYENNE` si `bruit | vibration | voyant` ou un DTC présent ;
   - sinon `BASSE`.
3. **Confiance** : `ÉLEVÉ` si DTC présents ; `MOYEN` si ≥ 3 mots-clés ou historique ; sinon `FAIBLE`.
4. **Hypothèses** :
   - DTC résolus → top 4 `toHypothesis` (avec cause racine alternative en `tip`) ;
   - sinon `base_causes` de la catégorie, top 4, probabilité `max(90 - i*15, 30)`, explication listant les mots-clés reconnus.
5. **Contrôles à réaliser** : tests DTC si présents (format `N. libellé (attendu : …)`), sinon 4 contrôles par défaut + contrôles spécifiques de catégorie (`addCommonControls` : moteur → analyse des gaz d'échappement, freinage → épaisseur disques/plaquettes, batterie → test de charge).
6. **Sortie expert étendue** : `result_doctrine` (doctrine DTC), `result_dtc` par code, plan 14 étapes `result_method`, causes critiques, contrôle final, cause racine alternative, réduction des pièces à remplacer.

## 4. Connaissances DTC

`dtcKnowledge.js` (~325 lignes) couvre un pan famille connu (P0100, P0170, P0171, P0300, P0301, P0400, P0420, P0500, P0113, P0110, P0335, C0035, B0001, U0100) : chaque code = `{interpretation, severity (CRITIQUE > ELEVEE > MOYENNE > BASSE), causes:[{label,prob,critical,tip}], tests:[{label,expected,interpretation}]}`. `lookup(code)` retombe sur des familles génériques (P/C/B/U) pour les codes non répertoriés.

**Doctrine** : « un code décrit une condition mesurée — il n'implique jamais *de facto* le remplacement de la pièce nommée » (une cause racine alternative est systématiquement proposée en `tip`).

## 5. Cycle applicatif

- `POST /api/diagnostic` : `DiagnosticAI.analyse(...)` → `manager.run('diagnose', …)` → résultat complet persistant dans `diagnostic_sessions`, réponse « bloc expertise » incluant hypothèses, urgence, confiance, contrôles, plan et doctriene.
- `GET /api/diagnostic/categories` : catégories exposées à l'UI.
- Pré-diagnostic du parcours (`issues`) : déclaration de problème déclenche le pré-diagnostic automatique (mêmes règles).