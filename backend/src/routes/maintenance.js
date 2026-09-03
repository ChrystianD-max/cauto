const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const maintenanceEngine = require('../utils/maintenanceEngine');
const { services: { maintenanceAI } } = require('../services/ai');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const userId = req.user.sub;
  const rows = await db.many(
    `SELECT v.* FROM vehicles v WHERE v.owner_id=$1 ORDER BY v.make`, [userId]
  );
  res.json({ vehicles: rows });
}));

router.get('/vehicle/:vehicleId', wrap(async (req, res) => {
  const v = await db.one('SELECT * FROM vehicles WHERE id=$1', [req.params.vehicleId]);
  if (!v) throw new HttpError(404, 'Véhicule introuvable');
  if (v.owner_id !== req.user.sub && !['GARAGE','MECANICIEN','ADMIN'].includes(req.user.role)) {
    throw new HttpError(403, 'Accès refusé');
  }

  // Décision issue du fournisseur de règles (Module 70) ; données constructeur
  // (programme) inchangées.
  const overview = await maintenanceAI.overview(v);

  let manufacturer_program = null;
  if (v.engine_name || v.make) {
    manufacturer_program = await maintenanceEngine.getManufacturerProgram(v).catch(() => null);
  }

  const actual_records = await db.many(
    `SELECT mr.*, ml.label AS interval_label
     FROM maintenance_records mr
     LEFT JOIN maintenance_intervals ml ON ml.id = (
       SELECT mi.id FROM maintenance_intervals mi
       JOIN maintenance_program_versions mpv ON mpv.id = mi.program_version_id
       JOIN maintenance_programs mp ON mp.id = mpv.program_id
       WHERE mi.label = mr.label LIMIT 1
     )
     WHERE mr.vehicle_id=$1 AND mr.type='ACTUAL'
     ORDER BY mr.done_at DESC`, [v.id]
  ).catch(() => []);

  const decision = overview.decision || {};
  res.json({
    vehicle: v,
    manufacturer_program,
    program_constructor: overview.program_constructor,
    recommendations_cauto: overview.recommendations_cauto,
    actual_records,
    all: overview.all,
    score: decision.score,
    alerts: decision.alerts,
    next_due: decision.next_due,
    health: decision.overall_status,
    ai_provider: overview.provider
  });
}));

module.exports = router;
