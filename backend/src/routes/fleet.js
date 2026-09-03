const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const engine = require('../utils/maintenanceEngine');
const tenancy = require('../utils/tenancy');

const router = express.Router();
router.use(requireAuth);

const ACTIVE_STATUSES = ['DIAGNOSTIC', 'QUOTE_SENT', 'QUOTE_APPROVED', 'REPAIRING', 'QUALITY_CHECK', 'CLIENT_VALIDATION'];

const driverSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().max(120).optional().default(''),
  phone: z.string().max(30).optional().default(''),
  license: z.string().max(60).optional().default(''),
});

const incidentSchema = z.object({
  vehicle_id: z.string().uuid(),
  driver_id: z.string().uuid().nullable().optional(),
  type: z.string().max(60).optional().default('AUTRE'),
  description: z.string().max(1500).optional().default(''),
  location: z.string().max(300).optional().default(''),
  occurred_at: z.string().datetime({ offset: true }).optional().nullable(),
  cost_cents: z.number().int().min(0).optional().default(0),
});

const costSchema = z.object({
  vehicle_id: z.string().uuid().nullable().optional(),
  category: z.string().max(60).optional().default('AUTRE'),
  amount_cents: z.number().int().min(0),
  description: z.string().max(1000).optional().default(''),
  occurred_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const assignSchema = z.object({
  driver_id: z.string().uuid().nullable(),
});

async function ownerVehicle(vehicleId, req) {
  const v = await db.one('SELECT * FROM vehicles WHERE id=$1', [vehicleId]);
  if (!v) throw new HttpError(404, 'Véhicule introuvable');
  const allowed = await tenancy.canAccessVehicle(req.user.sub, req.user.role, v);
  if (!allowed) throw new HttpError(403, 'Véhicule non autorisé');
  return v;
}

router.get('/dashboard', wrap(async (req, res) => {
  const scope = await tenancy.vehicleScope(req.user.sub, req.user.role);
  const vehicles = await db.many(
    `SELECT * FROM vehicles v WHERE ${scope.sql} ORDER BY year DESC, make, model`,
    scope.params
  );
  const open = await db.many(
    `SELECT DISTINCT i.vehicle_id
     FROM interventions i JOIN vehicles v ON v.id = i.vehicle_id
     WHERE ${scope.sql.replace(/v\./g, 'v.')} AND i.status <> 'CLOSED'`,
    scope.params
  );
  const immobilizedIds = new Set(open.map((r) => r.vehicle_id));
  const total = vehicles.length;
  const immobilized = immobilizedIds.size;
  const operational = Math.max(0, total - immobilized);

  let maintenanceDueSoon = 0;
  const dueSoon = [];
  for (const v of vehicles) {
    const o = await engine.overview(v);
    if (o.alerts.length > 0) {
      maintenanceDueSoon++;
      dueSoon.push({ vehicle: v, alerts: o.alerts, score: o.score });
    }
  }
  dueSoon.sort((a, b) => a.score - b.score);

  const driversRow = await db.one('SELECT COUNT(*)::int AS count FROM fleet_drivers WHERE owner_id=$1', [req.user.sub]);
  const incidentsRow = await db.one(
    'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE resolved=FALSE)::int AS open FROM fleet_incidents WHERE owner_id=$1',
    [req.user.sub]
  );
  const costsRow = await db.one(
    `SELECT COALESCE(SUM(amount_cents),0)::int AS total,
            COALESCE(SUM(amount_cents) FILTER (WHERE occurred_at >= date_trunc('year', CURRENT_DATE)),0)::int AS ytd
     FROM fleet_costs WHERE owner_id=$1`,
    [req.user.sub]
  );

  res.json({
    stats: {
      total_vehicles: total,
      operational,
      immobilized,
      maintenance_due_soon: maintenanceDueSoon,
      drivers: driversRow.count,
      incidents_open: incidentsRow.open,
      incidents_total: incidentsRow.total,
      costs_total: costsRow.total,
      costs_ytd: costsRow.ytd,
    },
    due_soon: dueSoon.map((d) => ({ vehicle_id: d.vehicle.id, plate: d.vehicle.plate, make: d.vehicle.make, model: d.vehicle.model, alerts: d.alerts.length, worst: d.alerts[0].label, worst_status: d.alerts[0].status })),
  });
}));

router.get('/vehicles', wrap(async (req, res) => {
  const scope = await tenancy.vehicleScope(req.user.sub, req.user.role);
  const vehicles = await db.many(
    `SELECT v.*, fd.name AS driver_name, fd.id AS driver_id,
            (EXISTS (
              SELECT 1 FROM interventions i
              WHERE i.vehicle_id = v.id AND i.status <> 'CLOSED'
            )) AS immobilized
     FROM vehicles v
     LEFT JOIN fleet_vehicle_assignments fva ON fva.vehicle_id = v.id
     LEFT JOIN fleet_drivers fd ON fd.id = fva.driver_id AND fd.owner_id = $1
     WHERE ${scope.sql}
     ORDER BY v.year DESC, v.make, v.model`,
    scope.params
  );
  res.json({ vehicles });
}));

router.patch('/vehicles/:id/assign', wrap(async (req, res) => {
  await ownerVehicle(req.params.id, req);
  const { driver_id } = assignSchema.parse(req.body);
  if (driver_id) {
    const d = await db.one('SELECT id FROM fleet_drivers WHERE id=$1 AND owner_id=$2', [driver_id, req.user.sub]);
    if (!d) throw new HttpError(404, 'Conducteur introuvable');
  }
  await db.query(
    `INSERT INTO fleet_vehicle_assignments (vehicle_id, driver_id, assigned_at)
     VALUES ($1, $2, now())
     ON CONFLICT (vehicle_id) DO UPDATE SET driver_id=EXCLUDED.driver_id, assigned_at=now()`,
    [req.params.id, driver_id]
  );
  res.json({ ok: true });
}));

router.get('/drivers', wrap(async (req, res) => {
  const drivers = await db.many(
    `SELECT fd.*, COUNT(fva.vehicle_id)::int AS vehicles_count
     FROM fleet_drivers fd
     LEFT JOIN fleet_vehicle_assignments fva ON fva.driver_id = fd.id
     WHERE fd.owner_id=$1
     GROUP BY fd.id
     ORDER BY fd.name ASC`,
    [req.user.sub]
  );
  res.json({ drivers });
}));

router.post('/drivers', wrap(async (req, res) => {
  const data = driverSchema.parse(req.body);
  const driver = await db.one(
    `INSERT INTO fleet_drivers (owner_id, name, email, phone, license)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.sub, data.name.trim(), data.email, data.phone, data.license]
  );
  res.status(201).json({ driver });
}));

router.patch('/drivers/:id', wrap(async (req, res) => {
  const d = await db.one('SELECT id FROM fleet_drivers WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.sub]);
  if (!d) throw new HttpError(404, 'Conducteur introuvable');
  const data = driverSchema.partial().parse(req.body);
  const sets = [];
  const params = [d.id];
  let idx = 2;
  for (const key of ['name', 'email', 'phone', 'license']) {
    if (data[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(data[key]);
      idx++;
    }
  }
  if (sets.length) await db.query(`UPDATE fleet_drivers SET ${sets.join(', ')} WHERE id=$1`, params);
  res.json({ ok: true });
}));

router.delete('/drivers/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM fleet_drivers WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.sub]);
  res.json({ ok: true });
}));

router.get('/incidents', wrap(async (req, res) => {
  const incidents = await db.many(
    `SELECT fi.*, v.plate, v.make, v.model, fd.name AS driver_name
     FROM fleet_incidents fi
     JOIN vehicles v ON v.id = fi.vehicle_id
     LEFT JOIN fleet_drivers fd ON fd.id = fi.driver_id
     WHERE fi.owner_id=$1
     ORDER BY fi.occurred_at DESC`,
    [req.user.sub]
  );
  res.json({ incidents });
}));

router.post('/incidents', wrap(async (req, res) => {
  const data = incidentSchema.parse(req.body);
  await ownerVehicle(data.vehicle_id, req);
  if (data.driver_id) {
    const d = await db.one('SELECT id FROM fleet_drivers WHERE id=$1 AND owner_id=$2', [data.driver_id, req.user.sub]);
    if (!d) throw new HttpError(404, 'Conducteur introuvable');
  }
  const incident = await db.one(
    `INSERT INTO fleet_incidents (owner_id, vehicle_id, driver_id, type, description, location, occurred_at, cost_cents)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now()),$8) RETURNING *`,
    [req.user.sub, data.vehicle_id, data.driver_id || null, data.type.trim().toUpperCase(), data.description, data.location, data.occurred_at || null, data.cost_cents]
  );
  res.status(201).json({ incident });
}));

router.patch('/incidents/:id/resolve', wrap(async (req, res) => {
  const i = await db.one('SELECT id FROM fleet_incidents WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.sub]);
  if (!i) throw new HttpError(404, 'Incident introuvable');
  const resolved = req.body.resolved === true;
  await db.query('UPDATE fleet_incidents SET resolved=$2 WHERE id=$1', [i.id, resolved]);
  res.json({ ok: true });
}));

router.get('/costs', wrap(async (req, res) => {
  const costs = await db.many(
    `SELECT fc.*, v.plate, v.make, v.model
     FROM fleet_costs fc
     LEFT JOIN vehicles v ON v.id = fc.vehicle_id
     WHERE fc.owner_id=$1
     ORDER BY fc.occurred_at DESC, fc.created_at DESC`,
    [req.user.sub]
  );
  res.json({ costs });
}));

router.post('/costs', wrap(async (req, res) => {
  const data = costSchema.parse(req.body);
  if (data.vehicle_id) await ownerVehicle(data.vehicle_id, req);
  const cost = await db.one(
    `INSERT INTO fleet_costs (owner_id, vehicle_id, category, amount_cents, description, occurred_at)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::date, CURRENT_DATE)) RETURNING *`,
    [req.user.sub, data.vehicle_id || null, data.category.trim().toUpperCase(), data.amount_cents, data.description, data.occurred_at || null]
  );
  res.status(201).json({ cost });
}));

router.delete('/costs/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM fleet_costs WHERE id=$1 AND owner_id=$2', [req.params.id, req.user.sub]);
  res.json({ ok: true });
}));

router.get('/reports', wrap(async (req, res) => {
  const byCategory = await db.many(
    `SELECT category, COUNT(*)::int AS items, SUM(amount_cents)::int AS total
     FROM fleet_costs WHERE owner_id=$1
     GROUP BY category ORDER BY total DESC`,
    [req.user.sub]
  );
  const byMonth = await db.many(
    `SELECT to_char(occurred_at, 'YYYY-MM') AS month, SUM(amount_cents)::int AS total
     FROM fleet_costs
     WHERE owner_id=$1 AND occurred_at >= date_trunc('month', CURRENT_DATE) - interval '5 months'
     GROUP BY 1 ORDER BY 1`,
    [req.user.sub]
  );
  const byIncidentType = await db.many(
    `SELECT type, COUNT(*)::int AS items, SUM(cost_cents)::int AS total
     FROM fleet_incidents WHERE owner_id=$1
     GROUP BY type ORDER BY items DESC`,
    [req.user.sub]
  );
  const repairsByMonth = await db.many(
    `SELECT to_char(i.created_at, 'YYYY-MM') AS month, COUNT(*)::int AS items
     FROM interventions i
     JOIN vehicles v ON v.id = i.vehicle_id
     WHERE v.owner_id=$1 AND i.status = 'CLOSED'
     GROUP BY 1 ORDER BY 1 DESC LIMIT 6`,
    [req.user.sub]
  );
  const topCosts = await db.many(
    `SELECT v.plate, v.make, v.model, COALESCE(SUM(fc.amount_cents),0)::int AS total
     FROM vehicles v
     LEFT JOIN fleet_costs fc ON fc.vehicle_id = v.id AND fc.owner_id = $1
     WHERE v.owner_id = $1
     GROUP BY v.id
     ORDER BY total DESC`,
    [req.user.sub]
  );
  res.json({ by_category: byCategory, by_month: byMonth, by_incident_type: byIncidentType, repairs_by_month: repairsByMonth, top_costs: topCosts });
}));

module.exports = router;