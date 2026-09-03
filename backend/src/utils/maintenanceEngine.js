const db = require('../db');

const MONTHS_MS = 30.4375 * 24 * 3600 * 1000;

function statusFor({ dueKm, dueDate, mileage, now }) {
  const kmLeft = dueKm - mileage;
  const daysLeft = Math.ceil((dueDate - now) / 86400000);
  const overdue = kmLeft <= 0 || daysLeft <= 0;
  const dueSoon = !overdue && (kmLeft <= 500 || daysLeft <= 30);
  return {
    overdue,
    dueSoon,
    status: overdue ? 'OVERDUE' : dueSoon ? 'DUE_SOON' : 'OK',
    km_left: kmLeft,
    days_left: daysLeft
  };
}

function baseline(vehicle) {
  return { odometer_km: vehicle.initial_mileage ?? vehicle.mileage, done_at: vehicle.created_at };
}

async function lastActual(vehicleId, ruleId) {
  const row = await db.one(
    `SELECT odometer_km, done_at FROM maintenance_records
     WHERE vehicle_id=$1 AND rule_id=$2 AND type='ACTUAL'
     ORDER BY done_at DESC, odometer_km DESC LIMIT 1`,
    [vehicleId, ruleId]
  );
  return row || null;
}

async function rulesFor(make, model) {
  return db.many(
    `SELECT * FROM maintenance_rules
     WHERE (make IS NULL OR make=$1) AND (model IS NULL OR model=$2)`,
    [make, model]
  );
}

async function overview(vehicle) {
  const rules = await rulesFor(vehicle.make, vehicle.model);
  const now = Date.now();
  const items = [];
  for (const rule of rules) {
    const actual = await lastActual(vehicle.id, rule.id);
    const base = actual ? { odometer_km: actual.odometer_km, done_at: actual.done_at } : baseline(vehicle);
    const dueKm = Number(base.odometer_km) + rule.interval_km;
    const dueDate = new Date(new Date(base.done_at).getTime() + rule.interval_months * MONTHS_MS);
    const st = statusFor({ dueKm, dueDate, mileage: vehicle.mileage, now });
    items.push({
      rule_id: rule.id,
      label: rule.label,
      source: rule.source,
      interval_km: rule.interval_km,
      interval_months: rule.interval_months,
      last_done: base,
      next_due_km: dueKm,
      next_due_date: dueDate.toISOString().slice(0, 10),
      ...st
    });
  }
  const overdueCount = items.filter((i) => i.overdue).length;
  const soonCount = items.filter((i) => i.dueSoon).length;
  const score = Math.max(40, 100 - 15 * overdueCount - 5 * soonCount);
  return {
    program_constructor: items.filter((i) => i.source === 'CONSTRUCTOR'),
    recommendations_cauto: items.filter((i) => i.source === 'CAUTO'),
    alerts: items.filter((i) => i.status !== 'OK'),
    score,
    all: items
  };
}

async function nextDue(vehicle) {
  const o = await overview(vehicle);
  const pending = o.all
    .filter((i) => i.status !== 'OK')
    .sort((a, b) => a.km_left - b.km_left)[0];
  return pending || null;
}

async function getManufacturerProgram(vehicle) {
  const mfr = await db.one(
    'SELECT id, name, country FROM manufacturers WHERE name ILIKE $1',
    [vehicle.make]
  );
  if (!mfr) return null;

  const mdl = await db.one(
    'SELECT id, name FROM vehicle_models WHERE manufacturer_id=$1 AND name ILIKE $2',
    [mfr.id, '%' + vehicle.model + '%']
  ).catch(() => null);
  if (!mdl) return { manufacturer: mfr, program: null, intervals: [] };

  let gen = null;
  if (vehicle.generation) {
    gen = await db.one(
      'SELECT id, name FROM vehicle_generations WHERE model_id=$1 AND name ILIKE $2',
      [mdl.id, '%' + vehicle.generation + '%']
    ).catch(() => null);
  }

  let eng = null;
  if (vehicle.engine_name) {
    const genId = gen ? gen.id : null;
    if (genId) {
      eng = await db.one(
        'SELECT id, name FROM engines WHERE generation_id=$1 AND name ILIKE $2',
        [genId, '%' + vehicle.engine_name + '%']
      ).catch(() => null);
    }
  }

  let prog = null;
  if (eng) {
    prog = await db.one(
      `SELECT mp.*, mpv.id AS version_id, mpv.version, mpv.effective_date
       FROM maintenance_programs mp
       JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id
       WHERE mp.engine_id = $1 AND mp.is_active = TRUE
       ORDER BY mpv.version DESC LIMIT 1`,
      [eng.id]
    ).catch(() => null);
  }
  if (!prog) {
    prog = await db.one(
      `SELECT mp.*, mpv.id AS version_id, mpv.version, mpv.effective_date
       FROM maintenance_programs mp
       JOIN maintenance_program_versions mpv ON mpv.program_id = mp.id
       WHERE mp.manufacturer_id = $1 AND mp.engine_id IS NULL AND mp.is_active = TRUE
       ORDER BY mpv.version DESC LIMIT 1`,
      [mfr.id]
    ).catch(() => null);
  }

  if (!prog) return { manufacturer: mfr, model: mdl, generation: gen, engine: eng, program: null, intervals: [] };

  const intervals = await db.many(
    `SELECT mi.*, json_agg(json_build_object(
        'id', mop.id, 'label', mop.label, 'description', mop.description,
        'is_check_only', mop.is_check_only, 'sort_order', mop.sort_order
      ) ORDER BY mop.sort_order) AS operations,
      (SELECT json_agg(json_build_object(
        'id', mc.id, 'label', mc.label, 'result_type', mc.result_type
      ) ORDER BY mc.sort_order) FROM maintenance_checks mc WHERE mc.interval_id = mi.id) AS checks
     FROM maintenance_intervals mi
     LEFT JOIN maintenance_operations mop ON mop.interval_id = mi.id
     WHERE mi.program_version_id = $1
     GROUP BY mi.id
     ORDER BY mi.sort_order, mi.interval_km`,
    [prog.version_id]
  ).catch(() => []);

  const sources = await db.many(
    'SELECT * FROM maintenance_sources WHERE program_id=$1', [prog.id]
  ).catch(() => []);

  return { manufacturer: mfr, model: mdl, generation: gen, engine: eng, program: prog, intervals, sources };
}

module.exports = { overview, nextDue, statusFor, getManufacturerProgram };
