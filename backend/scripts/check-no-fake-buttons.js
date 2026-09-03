'use strict';

/* =============================================================================
   C-AUTO — Règle anti-boutons fictifs (module 68) : vérificateur
   -----------------------------------------------------------------------------
   Interdit les boutons sans fonction, en particulier l'anti-pattern :
     onClick={() => alert("Coming soon")}
   Sauf pour une fonctionnalité EXPLICITEMENT identifiée comme future, qui doit
   afficher le message normalisé : « Fonctionnalité en préparation. »

   Son périmètre est volontairement STRICT (anti-pattern exact) pour ne jamais
   produire de faux positif :
     1. alert('Coming soon' / "Coming soon" / `Coming soon`) — case-insensitive,
        toute ponctuation de contenu.
     2. Toute occurrence littérale "Coming soon"/'Coming soon' (libellé de
        bouton fictif) hors commentaire de document.

   Le message légitime « Fonctionnalité en préparation. » est explicitement
   AUTORISÉ et n'est jamais signalé.

   Fichiers inspectés : frontend/www/app (js + html) et frontend/www/js (js).
   Hors .test.js et .spec.js (test = zone autorisée pour mocks).
   =========================================================================== */

const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', '..', 'frontend', 'www');
const ALLOWED_MESSAGE = 'fonctionnalité en préparation';

// 1) alert("Coming soon") — gère ', " et ` autour du contenu.
const ALERT_COMING_SOON =
  /\balert\s*\(\s*[`'"]\s*coming\s+soon\s*[`'"]\s*\)/i;
// 2) Libellé littéral "Coming soon" (fallback).
const LITERAL_COMING_SOON = /[`'"]\s*coming\s+soon\s*[`'"]/i;

function rel(p) {
  return p.replace(path.join(__dirname, '..', '..'), '.');
}

function walk(dir, errors, checked) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (['node_modules', 'vendor'].includes(e.name)) continue;
      walk(path.join(dir, e.name), errors, checked);
    } else if (e.isFile() && /\.(js|html)$/.test(e.name) && !e.name.endsWith('.test.js') && !e.name.endsWith('.spec.js')) {
      checked += 1;
      const file = path.join(dir, e.name);
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        // Ignorer les blocs de commentaires de document (/* … */) pour le
        // littéral "Coming soon" ; alert() reste toujours signalé.
        const isComment = line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*');
        if (ALERT_COMING_SOON.test(line)) {
          errors.push(`${rel(file)}:${idx + 1} — ALERT_COMING_SOON : ${line.trim()}`);
        } else if (!isComment && LITERAL_COMING_SOON.test(line)) {
          errors.push(`${rel(file)}:${idx + 1} — libellé « Coming soon » (bouton fictif) : ${line.trim()}`);
        }
      });
    }
  }
  return checked;
}

let checked = 0;
const errors = [];
checked = walk(APP_DIR, errors, checked);

console.log(`[anti-boutons-fictifs] ${checked} fichier(s) inspecté(s) dans frontend/www.`);

if (errors.length) {
  console.error(`\n[anti-boutons-fictifs] VIOLATION — ${errors.length} bouton(s) fictif(s) détecté(s) :`);
  errors.forEach((e) => console.error('  ✗ ' + e));
  console.error('\nRègle (module 68) : chaque bouton doit avoir une fonction réelle. ' +
    `Pour une fonctionnalité explicitement future, afficher : « ${ALLOWED_MESSAGE}. »`);
  console.error('[anti-boutons-fictifs] Résultat : ÉCHEC.');
  process.exit(1);
}

console.log('[anti-boutons-fictifs] OK — aucun bouton fictif (alert("Coming soon") ou libellé « Coming soon ») dans le frontend.');
process.exit(0);
