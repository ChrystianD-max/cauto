const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { validate, z } = require('../utils/validate');
const LocationService = require('../services/gps/LocationService');
const RoutingService = require('../services/gps/RoutingService');
const ETAService = require('../services/gps/ETAService');

const router = express.Router();
router.use(requireAuth);

const coordSchema = z.object({
  from: z.string().min(7).max(80),
  to: z.string().min(7).max(80)
});

const pingSchema = z.object({
  vehicle_id: z.string().uuid(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  speed_kph: z.number().min(0).max(400).optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracy_m: z.number().min(0).max(10000).optional(),
  altitude_m: z.number().optional(),
  source: z.string().max(20).optional()
}).passthrough();

const consentSchema = z.object({
  vehicle_id: z.string().uuid(),
  consent: z.boolean()
});

const startSchema = z.object({
  vehicle_id: z.string().uuid(),
  interval_sec: z.number().int().min(5).max(3600).optional()
});

function parseCoord(s, name) {
  const m = String(s).split(',');
  if (m.length !== 2) throw new HttpError(400, `${name} doit être "lat,lng"`);
  const lat = parseFloat(m[0]);
  const lng = parseFloat(m[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, `${name} invalide`);
  return [lat, lng];
}

// ---------- Zones ----------
router.get('/zones', wrap(async (req, res) => {
  res.json({ zones: await LocationService.getActiveZones() });
}));

// ---------- Consentement ----------
router.get('/consent', wrap(async (req, res) => {
  const vehicle_id = req.query.vehicle_id;
  if (!vehicle_id) throw new HttpError(400, 'vehicle_id requis');
  const owner = await LocationService.ownerOf(vehicle_id);
  if (!owner) throw new HttpError(404, 'Véhicule introuvable');
  if (owner !== req.user.sub && !['ADMIN', 'FLEET_MANAGER'].includes(req.user.role)) {
    throw new HttpError(403, 'Accès refusé');
  }
  res.json({ vehicle_id, consent: await LocationService.getConsent(owner, vehicle_id) });
}));

router.post('/consent', validate(consentSchema), wrap(async (req, res) => {
  const { vehicle_id, consent } = req.body;
  const owner = await LocationService.ownerOf(vehicle_id);
  if (!owner) throw new HttpError(404, 'Véhicule introuvable');
  if (owner !== req.user.sub && !['ADMIN', 'FLEET_MANAGER', 'SUPER_ADMIN'].includes(req.user.role)) {
    throw new HttpError(403, 'Seul le propriétaire (ou un gestionnaire de flotte) gère le consentement');
  }
  const result = await LocationService.setConsent(owner, vehicle_id, consent, req.user.sub);
  res.json({ vehicle_id, consent: result });
}));

// ---------- Suivi ----------
router.post('/tracking/start', validate(startSchema), wrap(async (req, res) => {
  const owner = await LocationService.ownerOf(req.body.vehicle_id);
  const authorized = owner === req.user.sub || ['ADMIN', 'FLEET_MANAGER', 'SUPER_ADMIN'].includes(req.user.role);
  if (!authorized) throw new HttpError(403, 'Accès refusé');
  const session = await LocationService.startTracking({
    vehicleId: req.body.vehicle_id,
    startedBy: req.user.sub,
    intervalSec: req.body.interval_sec || 30
  });
  res.status(201).json({ session });
}));

router.post('/tracking/stop', validate(z.object({ vehicle_id: z.string().uuid() })), wrap(async (req, res) => {
  const owner = await LocationService.ownerOf(req.body.vehicle_id);
  const authorized = owner === req.user.sub || ['ADMIN', 'FLEET_MANAGER', 'SUPER_ADMIN'].includes(req.user.role);
  if (!authorized) throw new HttpError(403, 'Accès refusé');
  await LocationService.stopTracking(req.body.vehicle_id, req.user.sub);
  res.json({ vehicle_id: req.body.vehicle_id, tracking: false });
}));

router.post('/tracking/ping', validate(pingSchema), wrap(async (req, res) => {
  const { vehicle_id, latitude, longitude, ...rest } = req.body;
  const owner = await LocationService.ownerOf(vehicle_id);
  const authorized = owner === req.user.sub ||
    ['FLEET_MANAGER', 'LIVREUR', 'ADMIN', 'SUPER_ADMIN'].includes(req.user.role);
  if (!authorized) throw new HttpError(403, 'Accès refusé');
  const pos = await LocationService.ping({ vehicleId: vehicle_id, actorId: req.user.sub, latitude, longitude, ...rest });
  res.status(201).json({ position: pos });
}));

// ---------- Lecture des positions (obfusquée si pas de privilège) ----------
router.get('/vehicle/:vehicleId', wrap(async (req, res) => {
  res.json(await LocationService.deliverPosition(req.params.vehicleId, req.user));
}));

router.get('/vehicles', requireRole('ADMIN', 'FLEET_MANAGER', 'SUPER_ADMIN'), wrap(async (req, res) => {
  res.json({ positions: await LocationService.listPositions(req.user) });
}));

// ---------- Distance / ETA ----------
router.get('/distance', validate(coordSchema, { where: 'query' }), wrap(async (req, res) => {
  const from = parseCoord(req.query.from, 'from');
  const to = parseCoord(req.query.to, 'to');
  res.json(await RoutingService.distance(from, to, { mode: req.query.mode || 'driving' }));
}));

router.get('/eta', validate(coordSchema, { where: 'query' }), wrap(async (req, res) => {
  const from = parseCoord(req.query.from, 'from');
  const to = parseCoord(req.query.to, 'to');
  const speedKph = req.query.speed_kph ? parseFloat(req.query.speed_kph) : undefined;
  res.json(await ETAService.estimate(from, to, { speedKph, mode: req.query.mode || 'driving' }));
}));

module.exports = router;