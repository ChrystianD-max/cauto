/* Worker C-AUTO :
   - toutes les 60 s : scan des échéances d'entretien atteintes (km OU mois)
     => notifications dédupliquées par jour/règle/véhicule
   - ping Redis pour maintenir la connexion observée par /api/health */
const { Pool } = require('pg');
const Redis = require('ioredis');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://cauto:cauto@postgres:5432/cauto' });
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
const MONTHS_MS = 30.4375 * 24 * 3600 * 1000;

async function scanDueMaintenance() {
  // Dernier entretien réel par véhicule+règle ; sinon baseline du véhicule.
  const { rows: due } = await pool.query(`
    WITH rules AS (
      SELECT r.*, v.id AS vehicle_id, v.owner_id, v.mileage, v.initial_mileage, v.created_at AS v_created
      FROM maintenance_rules r CROSS JOIN vehicles v
      WHERE (r.make IS NULL OR r.make=v.make) AND (r.model IS NULL OR r.model=v.model)
    ),
    last_actual AS (
      SELECT DISTINCT ON (vehicle_id, rule_id) vehicle_id, rule_id, odometer_km, done_at
      FROM maintenance_records WHERE type='ACTUAL'
      ORDER BY vehicle_id, rule_id, done_at DESC, odometer_km DESC
    )
    SELECT rs.vehicle_id, rs.owner_id, rs.rule_id, rs.label,
           GREATEST(COALESCE(la.odometer_km, rs.initial_mileage), 0) + rs.interval_km AS due_km,
           (COALESCE(la.done_at, rs.v_created)::date + make_interval(months => rs.interval_months))::timestamptz AS due_date,
           rs.mileage
    FROM rules rs LEFT JOIN last_actual la ON la.vehicle_id=rs.vehicle_id AND la.rule_id=rs.rule_id
    WHERE COALESCE(la.odometer_km, rs.initial_mileage) + rs.interval_km <= rs.mileage
       OR (COALESCE(la.done_at, rs.v_created)::date + make_interval(months => rs.interval_months)) <= now()
  `);
  let created = 0;
  for (const d of due) {
    const key = `due:${d.vehicle_id}:${d.rule_id}:${new Date().toISOString().slice(0, 10)}`;
    const res = await pool.query(
      `INSERT INTO notifications (user_id,message,dedupe_key)
       VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [d.owner_id, `Échéance d'entretien atteinte : ${d.label}`, key]
    );
    if (res.rowCount > 0) created++;
  }
  return { due_count: due.length, notifications_created: created };
}

let running = true;
async function tick() {
  if (!running) return;
  try {
    await redis.ping();
    const r = await scanDueMaintenance();
    if (r.due_count > 0) console.log('[worker] maintenance scan', r);
  } catch (e) {
    console.error('[worker]', e.message);
  }
}

console.log('[worker] démarré — scan des échéances toutes les 60 s');
tick();
const timer = setInterval(tick, 60000);
process.on('SIGTERM', () => { running = false; clearInterval(timer); redis.disconnect(); pool.end().then(() => process.exit(0)); });
