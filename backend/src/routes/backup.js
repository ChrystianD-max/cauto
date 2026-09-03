const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { audit } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

router.post('/export', requireRole('ADMIN'), wrap(async (req, res) => {
  const [users, vehicles, maintenanceRules, maintenanceRecords, issues, appointments, interventions, payments, warranties, ratings, notifications, auditLogs] = await Promise.all([
    db.many('SELECT id,name,email,phone,role,created_at FROM users'),
    db.many('SELECT * FROM vehicles'),
    db.many('SELECT * FROM maintenance_rules'),
    db.many('SELECT * FROM maintenance_records'),
    db.many('SELECT * FROM issues'),
    db.many('SELECT * FROM appointments'),
    db.many('SELECT * FROM interventions'),
    db.many('SELECT * FROM payments'),
    db.many('SELECT * FROM warranties'),
    db.many('SELECT * FROM ratings'),
    db.many('SELECT * FROM notifications'),
    db.many('SELECT id,actor_id,action,entity,entity_id,meta,ip,created_at FROM audit_logs')
  ]);
  await audit(req, 'admin.export_data', 'backup', null, { counts: { users: users.length, vehicles: vehicles.length } });
  res.json({
    exported_at: new Date().toISOString(),
    version: '1.0',
    data: { users, vehicles, maintenanceRules, maintenanceRecords, issues, appointments, interventions, payments, warranties, ratings, notifications, auditLogs }
  });
}));

router.post('/import', requireRole('ADMIN'), wrap(async (req, res) => {
  const { data } = req.body;
  if (!data || typeof data !== 'object') throw new HttpError(400, 'Format de données invalide');
  let imported = { users: 0, vehicles: 0, rules: 0 };
  await db.tx(async (c) => {
    if (data.users) {
      for (const u of data.users) {
        try {
          await c.query(
            `INSERT INTO users (id,name,email,phone,role,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
            [u.id, u.name, u.email, u.phone, u.role, u.created_at]
          );
          imported.users++;
        } catch (e) { /* skip duplicates */ }
      }
    }
    if (data.vehicles) {
      for (const v of data.vehicles) {
        try {
          await c.query(
            `INSERT INTO vehicles (id,owner_id,make,model,year,plate,vin,mileage,initial_mileage,created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
            [v.id, v.owner_id, v.make, v.model, v.year, v.plate, v.vin, v.mileage, v.initial_mileage, v.created_at]
          );
          imported.vehicles++;
        } catch (e) { /* skip */ }
      }
    }
    if (data.maintenanceRules) {
      for (const r of data.maintenanceRules) {
        try {
          await c.query(
            `INSERT INTO maintenance_rules (id,make,model,label,interval_km,interval_months,source)
             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
            [r.id, r.make, r.model, r.label, r.interval_km, r.interval_months, r.source]
          );
          imported.rules++;
        } catch (e) { /* skip */ }
      }
    }
  });
  await audit(req, 'admin.import_data', 'backup', null, { imported });
  res.json({ message: 'Import terminé', imported });
}));

module.exports = router;
