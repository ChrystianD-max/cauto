// db:seed — Seeds SQL idempotents de la stack réelle (db/seed_v*.sql).
// Les données applicatives (utilisateurs démo, véhicules, interventions…)
// sont ensuite créées par seed/seed.js (js), déclenché via "db:seed".
// Usage : DATABASE_URL (défaut postgres local compose) ; npm run db:seed.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_DIR = path.join(__dirname, '..', '..', 'db');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://cauto:cauto@localhost:5432/cauto';

async function main() {
  const seeds = fs.readdirSync(DB_DIR)
    .filter((f) => /^seed_v(\d+).*\.sql$/.test(f))
    .sort((a, b) => parseInt(a.match(/^seed_v(\d+)/)[1], 10) - parseInt(b.match(/^seed_v(\d+)/)[1], 10));
  if (seeds.length === 0) throw new Error('Aucun seed SQL trouvé dans ' + DB_DIR);

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    for (const f of seeds) {
      console.log('→ ' + f);
      const sql = fs.readFileSync(path.join(DB_DIR, f), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log('✓ ' + f);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Échec de ${f} : ${e.message}`);
      }
    }
    console.log('db:seed (SQL) terminé. Seed applicatif : npm run seed');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('db:seed —', e.message); process.exit(1); });