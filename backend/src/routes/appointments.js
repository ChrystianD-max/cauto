const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { audit } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

router.post('/', requireRole('CLIENT', 'GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  const s = z.object({
    vehicle_id: z.string().uuid(),
    professional_id: z.string().uuid(),
    scheduled_at: z.string().datetime()
  }).parse(req.body);
  const v = await db.one('SELECT * FROM vehicles WHERE id=$1', [s.vehicle_id]);
  if (!v) throw new HttpError(404, 'Véhicule introuvable');
  if (v.owner_id !== req.user.sub) throw new HttpError(403, 'Véhicule non autorisé');
  const pro = await db.one('SELECT * FROM professionals WHERE id=$1', [s.professional_id]);
  if (!pro) throw new HttpError(404, 'Professionnel introuvable');
  const appt = await db.one(
    `INSERT INTO appointments (vehicle_id, professional_id, scheduled_at)
     VALUES ($1,$2,$3) RETURNING *`,
    [v.id, s.professional_id, s.scheduled_at]
  );
  await db.query(
    `INSERT INTO notifications (user_id,message,dedupe_key)
     VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
    [pro.user_id, `Nouveau rendez-vous demandé pour ${v.plate}`, `appt:${appt.id}:created`]
  );
  await audit(req, 'appointment.create', 'appointment', appt.id, {});
  res.status(201).json({ appointment: appt });
}));

router.get('/mine', wrap(async (req, res) => {
  const rows = await db.many(
    `SELECT a.*, v.plate, v.make, v.model,
            p.specialty, pu.name AS professional_name, i.id AS intervention_id, i.status AS intervention_status
     FROM appointments a
     JOIN vehicles v ON v.id=a.vehicle_id
     JOIN professionals p ON p.id=a.professional_id
     JOIN users pu ON pu.id=p.user_id
     LEFT JOIN interventions i ON i.appointment_id=a.id
     WHERE v.owner_id=$1 OR p.user_id=$2
     ORDER BY a.scheduled_at DESC`,
    [req.user.sub, req.user.sub]
  );
  res.json({ appointments: rows });
}));

// Réception du véhicule par le professionnel => création de l'intervention
router.post('/:id/receive', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  const a = await db.one('SELECT * FROM appointments WHERE id=$1', [req.params.id]);
  if (!a) throw new HttpError(404, 'Rendez-vous introuvable');
  const pro = await db.one('SELECT * FROM professionals WHERE id=$1 AND user_id=$2', [a.professional_id, req.user.sub]);
  if (!pro) throw new HttpError(403, 'Ce rendez-vous ne vous est pas destiné');
  if (a.status !== 'REQUESTED' && a.status !== 'CONFIRMED') {
    throw new HttpError(409, 'Réception déjà effectuée');
  }
  const intervention = await db.tx(async (c) => {
    await c.query(`UPDATE appointments SET status='VEHICLE_RECEIVED' WHERE id=$1`, [a.id]);
    const i = await c.query(
      `INSERT INTO interventions (appointment_id, vehicle_id, professional_id)
       VALUES ($1,$2,$3) RETURNING *`,
      [a.id, a.vehicle_id, a.professional_id]
    );
    return i.rows[0];
  });
  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     VALUES ($1,'INTERVENTION','Véhicule réceptionné en atelier',$2,$3)`,
    [a.vehicle_id, JSON.stringify({ intervention_id: intervention.id }), req.user.sub]
  );
  const owner = await db.one('SELECT owner_id FROM vehicles WHERE id=$1', [a.vehicle_id]);
  await db.query(
    `INSERT INTO notifications (user_id,message,dedupe_key)
     VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
    [owner.owner_id, 'Votre véhicule a été réceptionné au garage', `intv:${intervention.id}:received`]
  );
  await audit(req, 'intervention.receive_vehicle', 'intervention', intervention.id, {});
  res.status(201).json({ intervention });
}));

module.exports = router;
