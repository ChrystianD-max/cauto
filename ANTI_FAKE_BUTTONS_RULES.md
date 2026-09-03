# Règle anti-boutons fictifs — Module 68

**Projet** : C-AUTO — Frontend SPA `/app`
**Version** : documentation de règle de développement + vérificateur CI
**Fichier de contrôle** : `backend/scripts/check-no-fake-buttons.js` (check CI bloquant, module 68, exécuté via `npm run check:nofakebuttons`)

---

## Règle

> **Chaque bouton doit avoir une fonction.** Un bouton cliquable doit déclencher une
> action réelle : navigation, appel API, ouverture de fenêtre modale, soumission de
> formulaire, changement d'état UI, etc.

Interdit :

```js
// ❌ INTERDIT — bouton fictif sans fonction :
onClick={() => alert("Coming soon")}
```

## Exception : fonctionnalité explicitement future

Si la fonctionnalité est **explicitement identifiée comme future** (planning produit,
roadmap validée), le bouton doit alors afficher le message **normalisé** :

```js
onClick={() => showToast('Fonctionnalité en préparation.')}
```

Le libellé exact requis : **« Fonctionnalité en préparation. »**
(Ce message est explicitement autorisé par le vérificateur.)

## Vérification CI (auto)

`npm run check:nofakebuttons` (ou `node backend/scripts/check-no-fake-buttons.js`) :
- Parcourt `frontend/www/app/**/*.{js,html}` et `frontend/www/js/**/*.js` ;
- **Détecte** : `alert("Coming soon")` / `alert('coming soon')` (case-insensitive) et
  tout libellé littéral « Coming soon » utilisé hors commentaire de document ;
- **N'ignore jamais** un `alert("Coming soon")`, même dans un commentaire ;
- **N'autorise PAS** « Fonctionnalité en préparation. » comme violation ;
- **Exit 1 (bloque la PR)** dès la première occurrence.

## Audit du code actuel (au moment de la rédaction)

**Aucune violation.** Sur l'ensemble du frontend (9 fichiers inspectés) :
- **0** `alert(...)` — aucun appel d'alerte ;
- **0** occurrence de « coming soon » (case-insensitive) ;
- **Tous** les gestionnaires de clic ont une **fonction réelle vérifiée** :
  `btn-logout` (déconnexion), menus de navigation (repli/expansion + persistance),
  « Imprimer » (`window.print()`), `del-veh` (suppression d'un véhicule), tabs
  (changement d'onglet), `rating-submit` (soumission de note), `submitQuote`
  (soumission de devis), `mo-upload` (upload), gestion des pièces/coûts (API
  `PATCH`/`DELETE`), chat (`startChatWith`), modal de refus (confirm/annuler),
  réessayer (`location.reload()`), affiche/masque mot de passe, etc.

La plupart des handlers sont des appels `api(...)`, des changements de `location.hash`
(navigation), ou des manipulations d'état `classList` — jamais un stub vide.

Résultat réel du vérificateur :

```
[anti-boutons-fictifs] 9 fichier(s) inspecté(s) dans frontend/www.
[anti-boutons-fictifs] OK — aucun bouton fictif (alert("Coming soon") ou
            libellé « Coming soon ») dans le frontend.  →  exit 0
```

Vérifié aussi avec un **probe** (3 cas : `alert("Coming soon")`, `alert("coming soon")`,
libellé `'Coming soon'` + ligne légitime `'Fonctionnalité en préparation.'`) :
- les 3 anti-patterns → **`VIOLATION … exit 1`** ;
- la ligne légitime → **non signalée** ;
- probe supprimé ensuite.
