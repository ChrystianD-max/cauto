const express = require('express');
const db = require('../../db');
const { requireAuth, requireRole } = require('../../middlewares/auth');
const { HttpError, wrap } = require('../../utils/errors');
const { validate, z } = require('../../utils/validate');

const router = express.Router();
router.use(requireAuth);

const subscribeSchema = z.object({
  plan_code: z.string().min(1),
  vehicle_id: z.string().uuid().optional()
}).passthrough();

// ---------- #4 Forfaits d'entretien / garantie ----------

// Catalogue des forfaits disponibles
router.get('/plans', wrap(async (req, res) => {
  const plans = await db.many('SELECT * FROM service_plans WHERE active=true ORDER BY price_cents');
  res.json({ plans });
}));

// S'abonner à un forfait
router.post('/subscribe', validate(subscribeSchema), wrap(async (req, res) => {
  if (req.user.role !== 'CLIENT') throw new HttpError(403, 'Réservé aux clients');

  const plan = await db.one(
    'SELECT * FROM service_plans WHERE code=$1 AND active=true',
    [req.body.plan_code]
  ).catch(() => null);
  if (!plan) throw new HttpError(404, 'Forfait introuvable');

  const existing = await db.query(
    `SELECT id FROM plan_subscriptions WHERE user_id=$1 AND plan_id=$2 AND status='ACTIVE'`,
    [req.user.sub, plan.id]
  );
  if (existing.rows.length > 0) throw new HttpError(400, 'Vous êtes déjà abonné à ce forfait');

  const durationMs = plan.period === 'MONTH' ? 30 * 24 * 3600 * 1000 : 365 * 24 * 3600 * 1000;

  const sub = await db.one(
    `INSERT INTO plan_subscriptions (user_id, plan_id, vehicle_id, starts_at, ends_at, status)
     VALUES ($1,$2,$3,now(), now() + interval '${plan.period === 'MONTH' ? '1 month' : '1 year'}', 'ACTIVE')
     RETURNING *`,
    [req.user.sub, plan.id, req.body.vehicle_id || null]
  );

  res.json({ subscription: sub, plan });
}));

// Mes abonnements
router.get('/subscriptions', wrap(async (req, res) => {
  const subs = await db.many(
    `SELECT ps.*, sp.name AS plan_name, sp.tier, sp.code, sp.emergency_towing,
            sp.extended_warranty_months, sp.priority_support
     FROM plan_subscriptions ps JOIN service_plans sp ON ps.plan_id = sp.id
     WHERE ps.user_id=$1 ORDER BY ps.created_at DESC`,
    [req.user.sub]
  );
  res.json({ subscriptions: subs });
}));

// Vérifier si un abonnement actif couvre une fonctionnalité
router.get('/check/:vehicleId/:feature', wrap(async (req, res) => {
  const { vehicleId, feature } = req.params;
  const sub = await db.query(
    `SELECT ps.*, sp.emergency_towing, sp.extended_warranty_months, sp.priority_support
     FROM plan_subscriptions ps JOIN service_plans sp ON ps.plan_id = sp.id
     WHERE ps.user_id=$1 AND ps.vehicle_id=$2 AND ps.status='ACTIVE' AND ps.ends_at > now()`,
    [req.user.sub, vehicleId]
  );
  if (sub.rows.length === 0) {
    return res.json({ active: false, feature });
  }
  const row = sub.rows[0];
  const featureMap = {
    towing: row.emergency_towing,
    warranty: row.extended_warranty_months > 0,
    priority: row.priority_support,
    checks: true
  };
  res.json({ active: true, feature, covered: !!featureMap[feature] });
}));

// Annuler un abonnement
router.post('/subscriptions/:subId/cancel', wrap(async (req, res) => {
  const sub = await db.one(
    'SELECT * FROM plan_subscriptions WHERE id=$1 AND user_id=$2',
    [req.params.subId, req.user.sub]
  ).catch(() => null);
  if (!sub) throw new HttpError(404, 'Abonnement introuvable');
  if (sub.status !== 'ACTIVE') throw new HttpError(400, 'Abonnement déjà terminé');
  await db.query(`UPDATE plan_subscriptions SET status='CANCELLED' WHERE id=$1`, [req.params.subId]);
  res.json({ success: true });
}));

module.exports = router;