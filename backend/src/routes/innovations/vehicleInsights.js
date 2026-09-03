const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const { requireAuth } = require('../../middlewares/auth');
const { HttpError, wrap } = require('../../utils/errors');
const { validate, z } = require('../../utils/validate');

const router = express.Router();

// Requêtes de validation de propriété (protégées individuellement)
function ownVehicle(userId, vehicleId) {
  return db.one('SELECT * FROM vehicles WHERE id=$1 AND owner_id=$2', [vehicleId, userId]);
}

const authRoute = (fn) => [requireAuth, wrap(fn)];

// ---------- #7 Estimation valeur de revente ----------
router.get('/vehicles/:vehicleId/valuation', authRoute(async (req, res) => {
  const vehicle = await ownVehicle(req.user.sub, req.params.vehicleId);
  if (!vehicle) throw new HttpError(404, 'Véhicule introuvable');

  // Cote marché (se replie sur une valeur par défaut si absente)
  const cote = await db.one(
    'SELECT * FROM cote_market WHERE make=$1 AND model=$2 AND year=$3',
    [vehicle.make, vehicle.model, vehicle.year]
  ).catch(() => null);

  const baseValue = cote ? cote.base_value_cents : 2500000;
  const depPct = cote ? cote.depreciation_per_year_pct : 12;
  const age = Math.max(0, new Date().getFullYear() - vehicle.year);
  const depreciation = Math.pow(1 - depPct / 100, age);
  const marketValue = Math.round(baseValue * depreciation);

  // Facteur santé (0.6 .. 1.15) à partir du health score
  const health = vehicle.health_score != null ? vehicle.health_score : 70;
  const healthFactor = (40 + health) / 110;
  const mileageFactor = Math.max(0.7, 1 - (vehicle.mileage || 0) / 2500000);

  const estimated = Math.round(marketValue * healthFactor * mileageFactor);
  const spread = 0.08;

  const factors = {
    base_value_cents: baseValue,
    depreciation_per_year_pct: depPct,
    age_years: age,
    health_score: health,
    health_factor: Math.round(healthFactor * 100) / 100,
    mileage: vehicle.mileage || 0,
    mileage_factor: Math.round(mileageFactor * 100) / 100
  };

  const existing = await db.one(
    'SELECT id FROM vehicle_valuations WHERE vehicle_id=$1 ORDER BY created_at DESC LIMIT 1',
    [req.params.vehicleId]
  ).catch(() => null);

  const valuation = await db.one(
    `INSERT INTO vehicle_valuations
      (vehicle_id, estimated_value_cents, market_min_cents, market_max_cents,
       health_factor, confidence, factors)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.vehicleId, estimated,
     Math.round(estimated * (1 - spread)),
     Math.round(estimated * (1 + spread)),
     factors.health_factor, 0.85, factors]
  );
  // purge des anciennes estimations du même véhicule
  await db.query('DELETE FROM vehicle_valuations WHERE vehicle_id=$1 AND id<>$2',
    [req.params.vehicleId, valuation.id]);

  res.json({ valuation, factors });
}));

router.get('/vehicles/:vehicleId/valuation/history', authRoute(async (req, res) => {
  const vehicle = await ownVehicle(req.user.sub, req.params.vehicleId);
  if (!vehicle) throw new HttpError(404, 'Véhicule introuvable');
  const history = await db.many(
    'SELECT * FROM vehicle_valuations WHERE vehicle_id=$1 ORDER BY created_at DESC LIMIT 20',
    [req.params.vehicleId]
  );
  res.json({ history });
}));

// ---------- #5 Passeport auto partageable QR ----------
const shareSchema = z.object({
  purpose: z.string().max(200).optional(),
  expires_in_days: z.coerce.number().int().min(1).max(365).optional()
}).passthrough();

router.post('/vehicles/:vehicleId/passport/share', validate(shareSchema), authRoute(async (req, res) => {
  const vehicle = await ownVehicle(req.user.sub, req.params.vehicleId);
  if (!vehicle) throw new HttpError(404, 'Véhicule introuvable');

  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = req.body.expires_in_days
    ? new Date(Date.now() + req.body.expires_in_days * 24 * 3600 * 1000).toISOString()
    : null;

  const share = await db.one(
    `INSERT INTO vehicle_passport_shares
      (vehicle_id, owner_user_id, share_token, purpose, expires_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.vehicleId, req.user.sub, token, req.body.purpose || null, expiresAt]
  );

  res.json({ share, url: `/api/innovations/vehicle-insights/passport/view/${token}` });
}));

// Accès public (via lien/QR) — monté sans requireAuth
router.get('/passport/view/:token', wrap(async (req, res) => {
  const share = await db.one(
    'SELECT * FROM vehicle_passport_shares WHERE share_token=$1', [req.params.token]
  ).catch(() => null);
  if (!share) throw new HttpError(404, 'Lien de partage introuvable');
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    throw new HttpError(410, 'Ce lien de partage a expiré');
  }

  await db.query(
    'UPDATE vehicle_passport_shares SET access_count=access_count+1, last_accessed_at=now() WHERE id=$1',
    [share.id]
  );

  const vehicle = await db.one('SELECT * FROM vehicles WHERE id=$1', [share.vehicle_id]);
  const history = await db.many(
    `SELECT i.*, v.make, v.model FROM interventions i
     LEFT JOIN service_requests sr ON i.service_request_id = sr.id
     LEFT JOIN vehicles v ON sr.vehicle_id = v.id
     WHERE sr.vehicle_id=$1 ORDER BY i.created_at DESC LIMIT 50`,
    [share.vehicle_id]
  ).catch(() => []);
  const maintenance = await db.many(
    `SELECT * FROM maintenance_alerts WHERE vehicle_id=$1 ORDER BY due_date`,
    [share.vehicle_id]
  ).catch(() => []);

  res.json({
    share: { purpose: share.purpose, created_at: share.created_at },
    vehicle: {
      id: vehicle.id, make: vehicle.make, model: vehicle.model, year: vehicle.year,
      plate: vehicle.plate, mileage: vehicle.mileage, fuel_type: vehicle.fuel_type
    },
    history, maintenance
  });
}));

router.get('/vehicles/:vehicleId/passport/shares', authRoute(async (req, res) => {
  const vehicle = await ownVehicle(req.user.sub, req.params.vehicleId);
  if (!vehicle) throw new HttpError(404, 'Véhicule introuvable');
  const shares = await db.many(
    'SELECT * FROM vehicle_passport_shares WHERE vehicle_id=$1 ORDER BY created_at DESC',
    [req.params.vehicleId]
  );
  res.json({ shares });
}));

router.delete('/passport/share/:shareId', authRoute(async (req, res) => {
  const share = await db.one(
    'SELECT * FROM vehicle_passport_shares WHERE id=$1 AND owner_user_id=$2',
    [req.params.shareId, req.user.sub]
  ).catch(() => null);
  if (!share) throw new HttpError(404, 'Partage introuvable');
  await db.query('DELETE FROM vehicle_passport_shares WHERE id=$1', [req.params.shareId]);
  res.json({ success: true });
}));

module.exports = router;
