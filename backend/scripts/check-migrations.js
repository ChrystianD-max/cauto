// db:check — Module 81 : garde-fou de politique MIGRATIONS.
// ---------------------------------------------------------
// Règle : TOUTE modification de base passe par une migration versionnée
// (db/migration_v<N>_nom.sql), appliquée et suivie par db-migrate.js dans la
// table schema_migrations. Interdit en production : modification manuelle
// non documentée (ALTER/CREATE/DROP ad hoc via psql ou un script one-shot).
//
// Ce script VÉRIFIE la convention du répertoire db/ :
//   1. init.sql présent ;
//   2. aucun fichier .sql hors-norme (ni migration, ni seed, ni init) ;
//   3. numéros de migration v<N> strictement séquentiels sans doublon ni trou,
//      en croissance depuis la dernière version ;
//   4. une migration ne contient PAS de blanchiment ad hoc : elle est le seul
//      vecteur d'évolution de schéma (les seeds ne font pas de DDL).
// Usage : node scripts/check-migrations.js   (npm run db:check)
// Sortie : exit 0 si conforme, exit 1 sinon (bloque la CI).
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', '..', 'db');
const errors = [];

function fail(msg) { errors.push(msg); }

const files = fs.readdirSync(DB_DIR).filter((f) => f.endsWith('.sql')).sort();

if (!files.includes('init.sql')) fail('db/init.sql manquant');
for (const f of files) {
  if (f === 'init.sql') continue;
  const isSeed = /^seed_v(\d+).*\.sql$/.test(f);
  const isMig = /^migration_v(\d+).*\.sql$/.test(f);
  if (!isSeed && !isMig) {
    fail(`Fichier SQL hors-norme dans db/ : ${f} — requis init.sql | seed_v*.sql | migration_v<N>_*.sql`);
  }
}

const migs = files
  .filter((f) => /^migration_v(\d+).*\.sql$/.test(f))
  .map((f) => ({ f, n: parseInt(f.match(/^migration_v(\d+)/)[1], 10) }))
  .sort((a, b) => a.n - b.n);

const seen = new Set();
for (const { f, n } of migs) {
  if (seen.has(n)) fail(`Numéro de migration dupliqué v${n} (${f})`);
  seen.add(n);
}

if (migs.length) {
  const nums = migs.map((m) => m.n);
  const first = nums[0];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) {
      fail(`Suite de migrations discontinue : ...v${nums[i - 1]} → v${nums[i]} (les versions doivent être séquentielles sans trou)`);
    }
  }
  if (first !== 2) wrongFirst();
  function wrongFirst() {
    fail(`Première migration v${first} : la première migration versionnée doit être v2 (v1 = init.sql)`);
  }
}

// Les seeds ne doivent pas contenir de DDL (la règle d'évolution passe par les
// migrations). Détection des mots-clés DDL les plus courants hors BEGIN/INSERT.
for (const f of files) {
  if (!/^seed_v(\d+).*\.sql$/.test(f)) continue;
  const sql = fs.readFileSync(path.join(DB_DIR, f), 'utf8').toUpperCase();
  for (const kw of ['CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE INDEX', 'CREATE VIEW', 'CREATE FUNCTION', 'CREATE TRIGGER']) {
    if (sql.includes(kw)) {
      fail(`DDL interdit dans un seed : ${f} contient « ${kw} » — toute évolution de schéma passe par db/migration_v*.sql (module 81)`);
    }
  }
}

if (errors.length) {
  console.error('db:check — NON CONFORME (module 81) :');
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('db:check — OK : convention migrations respectée (' + migs.length + ' migration(s), ' +
  files.filter((f) => /^seed_v/.test(f)).length + ' seed(s), init.sql présent).');