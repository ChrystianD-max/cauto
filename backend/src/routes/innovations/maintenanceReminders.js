const express = require('express');
const db = require('../../db');
const { requireAuth, requireRole } = require('../../middlewares/auth');
const { HttpError, wrap } = require('../../utils/errors');
const { validate, z } = require('../../utils/validate');
const messaging = require('../../connectors/messaging');

const router = express.Router();
router.use(requireAuth);

const generateSchema = z.object({
  vehicle_id: z.string().uuid(),
  channel: z.enum(['WHATSAPP', 'SMS']).optional()
}).passthrough();

const updateSchema = z.object({ status: z.enum(['SENT', 'DELIVERED', 'FAILED', 'DISMISSED']) }).passthrough();

// ---------- #2 Rappels maintenance proactifs ----------

// Génère automatiquement les rappels en retard à partir des maintenance_alerts OPEN.
router.post('/generate', validate(generateSchema), wrap(async (req, res) => {
  if (req.user.role !== 'CLIENT') throw new HttpError(403, 'Réservé aux clients');
  const { vehicle_id, channel = 'WHATSAPP' } = req.body;

  const alerts = await db.many(
    `SELECT * FROM maintenance_alerts
     WHERE vehicle_id=$1 AND status='OPEN' AND due_date IS NOT NULL
       AND due_date <= CURRENT_DATE + interval '14 days'`,
    [vehicle_id]
  ).catch(() => []);

  const user = await db.one('SELECT phone FROM users WHERE id=$1', [req.user.sub]);
  const vehicle = await db.one('SELECT make, model FROM vehicles WHERE id=$1', [vehicle_id]);
  const reminders = [];

  for (const alert of alerts) {
    const exists = await db.query(
      `SELECT id FROM maintenance_reminders WHERE op_key=$1 AND user_id=$2 AND status IN ('SENT','DELIVERED')`,
      [`${alert.id}`, req.user.sub]
    );
    if (exists.rows.length > 0) continue;

    const template = `${vehicle.make} ${vehicle.model} : ${messaging.renderTemplate(alert.label || 'Opération de maintenance')} prévue le ${alert.due_date.toISOString ? alert.due_date.toISOString().slice(0, 10) : alert.due_date}`;
    const sent = await messaging.send({ channel, to: user.phone, template });

    const r = await db.one(
      `INSERT INTO maintenance_reminders
         (user_id, vehicle_id, maintenance_id, op_key, title, due_at, channel, status, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.sub, vehicle_id, alert.id, `${alert.id}`,
       alert.label || 'Rappel maintenance', new Date(`${(alert.due_date.toISOString ? alert.due_date.toISOString().slice(0, 10) : alert.due_date)}T08:00:00Z`),
       channel, sent.status, sent.sentAt]
    );
    reminders.push(r);
  }

  await db.query(
    `UPDATE maintenance_alerts SET status='RESOLVED' WHERE vehicle_id=$1 AND status='OPEN' AND due_date <= CURRENT_DATE`,
    [vehicle_id]
  );

  res.json({ reminders, count: reminders.length });
}));

// Lister mes rappels
router.get('/', wrap(async (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM maintenance_reminders WHERE user_id=$1';
  const params = [req.user.sub];
  if (status) {
    params.push(status);
    sql += ` AND status=$${params.length}`;
  }
  sql += ' ORDER BY created_at DESC LIMIT 100';
  const reminders = await db.many(sql, params);
  res.json({ reminders });
}));

// Mettre à jour le statut d'un rappel (admin ou simulation)
router.patch('/:id/status', validate(updateSchema), wrap(async (req, res) => {
  if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Accès réservé aux administrateurs');
  const r = await db.one(
    'UPDATE maintenance_reminders SET status=$1 WHERE id=$2 RETURNING *',
    [req.body.status, req.params.id]
  ).catch(() => null);
  if (!r) throw new HttpError(404, 'Rappel introuvable');
  res.json({ reminder: r });
}));

module.exports = router;