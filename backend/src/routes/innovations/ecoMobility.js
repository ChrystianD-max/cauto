const express = require('express');
const db = require('../../db');
const { requireAuth } = require('../../middlewares/auth');
const { HttpError, wrap } = require('../../utils/errors');
const { validate, z } = require('../../utils/validate');

const router = express.Router();
router.use(requireAuth);

const registerStationSchema = z.object({
  name: z.string().min(1).max(200),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  city: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  connector_types: z.array(z.string()).optional(),
  power_kw: z.coerce.number().min(0).optional(),
  price_per_kwh_cents: z.coerce.number().min(0).optional(),
  available: z.coerce.boolean().optional(),
  open_24h: z.coerce.boolean().optional()
}).passthrough();

const chargingProfileSchema = z.object({
  vehicle_id: z.string().uuid(),
  battery_kwh: z.coerce.number().min(0).optional(),
  connector_type: z.string().optional(),
  avg_consumption_kwh_per_100km: z.coerce.number().min(0).optional(),
  home_charge_price_cents: z.coerce.number().min(0).optional()
}).passthrough();

const sessionSchema = z.object({
  vehicle_id: z.string().uuid(),
  station_id: z.string().uuid().optional(),
  duration_min: z.coerce.number().int().min(1).optional(),
  energy_kwh: z.coerce.number().min(0).optional(),
  cost_cents: z.coerce.number().min(0).optional()
}).passthrough();

// ---------- #6 Recharge Ã©lectrique & mobilitÃ© verte ----------

// Recherche stations de recharge proches (rayon en km)
router.get('/stations', wrap(async (req, res) => {
  const { latitude, longitude, radius_km = 30 } = req.query;
  if (!latitude || !longitude) {
    const stations = await db.many('SELECT * FROM charging_stations WHERE available=true ORDER BY created_at DESC LIMIT 50');
    return res.json({ stations });
  }
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const r = parseFloat(radius_km);
  const stations = await db.many(
    `SELECT *,
      earth_distance(ll_to_earth(latitude, longitude), ll_to_earth($1,$2)) / 1000 AS distance_km
     FROM charging_stations
     WHERE available=true
       AND earth_distance(ll_to_earth(latitude, longitude), ll_to_earth($1,$2)) <= $3 * 1000
     ORDER BY earth_distance(ll_to_earth(latitude, longitude), ll_to_earth($1,$2))`,
    [lat, lng, r]
  ).catch(() => []);
  res.json({ stations });
}));

// Enregistrer une station (admin ou pro)
router.post('/stations', validate(registerStationSchema), wrap(async (req, res) => {
  if (!['ADMIN', 'SUPER_ADMIN', 'GARAGE', 'MECANICIEN'].includes(req.user.role)) {
    throw new HttpError(403, 'AccÃ¨s refusÃ©');
  }
  const s = await db.one(
    `INSERT INTO charging_stations
       (name, latitude, longitude, city, address, connector_types,
        power_kw, price_per_kwh_cents, available, open_24h)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.body.name, req.body.latitude, req.body.longitude,
     req.body.city || null, req.body.address || null,
     req.body.connector_types || [], req.body.power_kw || null,
     req.body.price_per_kwh_cents || null,
     req.body.available !== false, req.body.open_24h || false]
  );
  res.json({ station: s });
}));

// Profil recharge d'un vÃ©hicule
router.post('/charging-profile', validate(chargingProfileSchema), wrap(async (req, res) => {
  if (req.user.role !== 'CLIENT' && req.user.role !== 'ADMIN') {
    throw new HttpError(403, 'AccÃ¨s refusÃ©');
  }
  const v = await db.query('SELECT id FROM vehicles WHERE id=$1 AND owner_id=$2',
    [req.body.vehicle_id, req.user.sub]);
  if (v.rows.length === 0) throw new HttpError(404, 'VÃ©hicule introuvable');

  const existing = await db.query('SELECT id FROM vehicle_charging_profile WHERE vehicle_id=$1',
    [req.body.vehicle_id]);

  let profile;
  if (existing.rows.length > 0) {
    profile = await db.one(
      `UPDATE vehicle_charging_profile SET
         battery_kwh=$1, connector_type=$2,
         avg_consumption_kwh_per_100km=$3, home_charge_price_cents=$4
       WHERE vehicle_id=$5 RETURNING *`,
      [req.body.battery_kwh || null, req.body.connector_type || null,
       req.body.avg_consumption_kwh_per_100km || null,
       req.body.home_charge_price_cents || null, req.body.vehicle_id]
    );
  } else {
    profile = await db.one(
      `INSERT INTO vehicle_charging_profile
         (vehicle_id, battery_kwh, connector_type, avg_consumption_kwh_per_100km, home_charge_price_cents)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.body.vehicle_id, req.body.battery_kwh || null,
       req.body.connector_type || null, req.body.avg_consumption_kwh_per_100km || null,
       req.body.home_charge_price_cents || null]
    );
  }
  res.json({ charging_profile: profile });
}));

// RÃ©cupÃ©rer le profil recharge d'un vÃ©hicule
router.get('/charging-profile/:vehicleId', wrap(async (req, res) => {
  const profile = await db.one(
    'SELECT * FROM vehicle_charging_profile WHERE vehicle_id=$1',
    [req.params.vehicleId]
  ).catch(() => null);
  if (!profile) throw new HttpError(404, 'Profil de recharge introuvable');
  res.json({ charging_profile: profile });
}));

// Logger une session de recharge
router.post('/sessions', validate(sessionSchema), wrap(async (req, res) => {
  if (req.user.role !== 'CLIENT') throw new HttpError(403, 'RÃ©servÃ© aux clients');
  const v = await db.query('SELECT id FROM vehicles WHERE id=$1 AND owner_id=$2',
    [req.body.vehicle_id, req.user.sub]);
  if (v.rows.length === 0) throw new HttpError(404, 'VÃ©hicule introuvable');

  const session = await db.one(
    `INSERT INTO charging_sessions_log
       (vehicle_id, station_id, duration_min, energy_kwh, cost_cents)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.body.vehicle_id, req.body.station_id || null,
     req.body.duration_min || null, req.body.energy_kwh || null,
     req.body.cost_cents || null]
  );
  res.json({ session });
}));

// Historique de recharge d'un vÃ©hicule
router.get('/sessions/:vehicleId', wrap(async (req, res) => {
  const v = await db.query('SELECT id FROM vehicles WHERE id=$1 AND owner_id=$2',
    [req.params.vehicleId, req.user.sub]);
  if (v.rows.length === 0) throw new HttpError(404, 'VÃ©hicule introuvable');

  const sessions = await db.many(
    `SELECT cs.*, cs2.name AS station_name
     FROM charging_sessions_log cs
     LEFT JOIN charging_stations cs2 ON cs.station_id = cs2.id
     WHERE cs.vehicle_id=$1 ORDER BY cs.created_at DESC LIMIT 50`,
    [req.params.vehicleId]
  );
  res.json({ sessions });
}));

// Bilan Ã©cologique (empreinte carbone Ã©vitÃ©e vs thermique)
router.get('/eco-summary/:vehicleId', wrap(async (req, res) => {
  const v = await db.query('SELECT id, fuel_type FROM vehicles WHERE id=$1 AND owner_id=$2',
    [req.params.vehicleId, req.user.sub]);
  if (v.rows.length === 0) throw new HttpError(404, 'VÃ©hicule introuvable');

  const stats = await db.one(
    `SELECT
       COALESCE(SUM(energy_kwh),0) AS total_energy_kwh,
       COALESCE(SUM(cost_cents),0) AS total_cost_cents,
       COUNT(*) AS sessions_count
     FROM charging_sessions_log WHERE vehicle_id=$1`,
    [req.params.vehicleId]
  );
  // 1 kWh elec = ~50g CO2 (moyenne Afrique subsaharienne), 1L essence = ~2.3 kg CO2
  const avoidedKg = Math.round(((stats.total_energy_kwh * 2.3) - (stats.total_energy_kwh * 0.05)) * 10) / 10;

  const profile = await db.one(
    'SELECT * FROM vehicle_charging_profile WHERE vehicle_id=$1',
    [req.params.vehicleId]
  ).catch(() => null);

  res.json({
    stats: {
      total_energy_kwh: parseFloat(stats.total_energy_kwh),
      total_cost_cents: parseInt(stats.total_cost_cents),
      sessions_count: parseInt(stats.sessions_count),
      co2_avoided_kg: avoidedKg
    },
    charging_profile: profile
  });
}));

module.exports = router;