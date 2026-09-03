// db:migrate — Applique l'évolution de schéma de la stack réelle :
//   db/init.sql (base) si base absente, puis db/migration_v*.sql dans l'ordre,
//   suivis dans la table de registre schema_migrations(version).
// DB déjà couverte (base présente sans registre) => versions adoptées sans
// re-exécution (migrations historiques déjà appliquées).
// Usage : DATABASE_URL (défaut postgres local compose) ; npm run db:migrate.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_DIR = path.join(__dirname, '..', '..', 'db');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cauto:cauto@localhost:5432/cauto';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // 1. Registre des migrations
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    // 2. Base : init.sql si le schéma de base n'existe pas encore
    const { rows: hasUsers } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='users'`
    );
    const fresh = hasUsers.length === 0;
    if (fresh) {
      console.log('Base absente → application de init.sql');
      await applyFile(client, path.join(DB_DIR, 'init.sql'));
      await client.query('INSERT INTO schema_migrations(version) VALUES(\'init\') ON CONFLICT DO NOTHING');
    }

    // 3. Migrations versionnées v2..v13 (ordre par numéro)
    const files = fs.readdirSync(DB_DIR)
      .filter((f) => /^migration_v(\d+).*\.sql$/.test(f))
      .sort((a, b) => {
        const va = parseInt(a.match(/^migration_v(\d+)/)[1], 10);
        const vb = parseInt(b.match(/^migration_v(\d+)/)[1], 10);
        return va - vb;
      });
    if (files.length === 0) throw new Error('Aucune migration trouvée dans ' + DB_DIR);

    const { rows: applied } = await client.query('SELECT version FROM schema_migrations');
    const have = new Set(applied.map((r) => r.version));

    if (!fresh && have.size === 0) {
      // DB existante déjà migrée hors registre → adoption sans re-exécution
      for (const f of files) {
        const v = f.match(/^migration_v(\d+)/)[1];
        await client.query('INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING', ['v' + v]);
        console.log('✓ adopté (déjà appliquée) : ' + f);
      }
      console.log(`Évolution déjà en place → ${files.length} version(s) adoptée(s).`);
      return;
    }

    for (const f of files) {
      const v = 'v' + f.match(/^migration_v(\d+)/)[1];
      if (have.has(v)) continue;
      console.log('→ ' + f);
      await applyFile(client, path.join(DB_DIR, f));
      await client.query('INSERT INTO schema_migrations(version) VALUES($1) ON CONFLICT DO NOTHING', [v]);
      console.log('✓ ' + v);
    }
    console.log('db:migrate terminé — schéma à jour.');
  } finally {
    await client.end();
  }
}

// Découpe un script SQL en instructions, en respectant littéraux '...', "..."
// commentaires --//* */ et blocs dollar-quotés $$...$$.
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  const n = sql.length;
  let inSingle = false, inDouble = false, lineComment = false, blockComment = false, dollarTag = null;
  while (i < n) {
    const c = sql[i];
    const c2 = sql.substr(i, 2);
    if (lineComment) {
      cur += c;
      if (c === '\n') lineComment = false;
      i++; continue;
    }
    if (blockComment) {
      cur += c;
      if (c2 === '*/') { cur += '*/'; i += 2; blockComment = false; }
      else i++;
      continue;
    }
    if (dollarTag) {
      cur += c;
      if (sql.startsWith(dollarTag, i)) { cur += dollarTag; i += dollarTag.length; dollarTag = null; }
      else i++;
      continue;
    }
    if (inSingle) {
      cur += c;
      if (c === "'") {
        if (sql[i + 1] === "'") { cur += "'"; i += 2; }
        else { i++; inSingle = false; }
      }
      else i++;
      continue;
    }
    if (inDouble) {
      cur += c;
      if (c === '"') inDouble = false;
      i++; continue;
    }
    if (c2 === '--') { lineComment = true; cur += c2; i += 2; continue; }
    if (c2 === '/*') { blockComment = true; cur += c2; i += 2; continue; }
    if (c === "'") { inSingle = true; cur += c; i++; continue; }
    if (c === '"') { inDouble = true; cur += c; i++; continue; }
    const dm = sql.substr(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dm) { dollarTag = dm[0]; cur += dm[0]; i += dm[0].length; continue; }
    if (c === ';') { out.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((s) => s.trim());
}

async function applyFile(client, file) {
  const sql = fs.readFileSync(file, 'utf8');
  // PostgreSQL interdit d'UTILISER un membre ajouté par ALTER TYPE ... ADD VALUE
  // dans la même transaction que l'ajout. Pour ces fichiers, chaque instruction
  // est exécutée en autocommit (sémantique psql pour laquelle ils sont écrits).
  const hasEnumAdd = /ALTER\s+TYPE[^;]*ADD\s+VALUE/i.test(sql);
  try {
    if (hasEnumAdd) {
      for (const stmt of splitStatements(sql)) {
        await client.query(stmt);
      }
    } else {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    }
  } catch (e) {
    if (!hasEnumAdd) await client.query('ROLLBACK');
    throw new Error(`Échec de ${path.basename(file)} : ${e.message}`);
  }
}

main().catch((e) => { console.error('db:migrate —', e.message); process.exit(1); });