const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const tenancy = require('../utils/tenancy');
const engine = require('../utils/maintenanceEngine');
const { services: { maintenanceAI, vehicleHistoryAI, vehicleHealthScoreAI } } = require('../services/ai');

const router = express.Router();
router.use(requireAuth);

async function ownedVehicle(req) {
  const v = await db.one('SELECT * FROM vehicles WHERE id=$1', [req.params.id]);
  if (!v) throw new HttpError(404, 'Véhicule introuvable');
  const allowed = await tenancy.canAccessVehicle(req.user.sub, req.user.role, v);
  if (!allowed) throw new HttpError(403, 'Accès refusé à ce véhicule');
  return v;
}

const vehicleSchema = z.object({
  make: z.string().min(1).max(60),
  model: z.string().min(1).max(80),
  year: z.number().int().min(1950).max(2100),
  plate: z.string().regex(/^[A-Z0-9\- ]{4,15}$/),
  // VIN : optionnel à la création (module 61/62) — le professionnel le saisit
  // à la réception du véhicule ; il ne revient pas au client de l'inscrire.
  vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/).optional().or(z.literal('')),
  mileage: z.number().int().min(0).max(2000000),
  generation: z.string().max(60).optional().default(''),
  engine_name: z.string().max(60).optional().default(''),
  displacement_cc: z.number().int().min(0).optional().default(0),
  fuel_type: z.enum(['ESSENCE','DIESEL','HYBRIDE','ELECTRIQUE','GPL']).optional().default('ESSENCE'),
  gearbox: z.enum(['MANUELLE','AUTOMATIQUE','SEMI_AUTO']).optional().default('MANUELLE'),
  transmission: z.enum(['TWD','FWD','RWD','AWD']).optional().default('TWD'),
  first_registration: z.string().nullish().default(null)
});

const patchSchema = z.object({
  make: z.string().min(1).max(60).optional(),
  model: z.string().min(1).max(80).optional(),
  year: z.number().int().min(1950).max(2100).optional(),
  mileage: z.number().int().min(0).max(2000000).optional(),
  generation: z.string().max(60).optional(),
  engine_name: z.string().max(60).optional(),
  displacement_cc: z.number().int().min(0).optional(),
  fuel_type: z.enum(['ESSENCE','DIESEL','HYBRIDE','ELECTRIQUE','GPL']).optional(),
  gearbox: z.enum(['MANUELLE','AUTOMATIQUE','SEMI_AUTO']).optional(),
  transmission: z.enum(['TWD','FWD','RWD','AWD']).optional(),
  first_registration: z.string().nullable().optional()
});

router.get('/', wrap(async (req, res) => {
  const scope = await tenancy.vehicleScope(req.user.sub, req.user.role);
  const rows = await db.many(
    `SELECT * FROM vehicles v WHERE ${scope.sql} ORDER BY created_at DESC`,
    scope.params
  );
  res.json({ vehicles: rows });
}));

router.post('/', wrap(async (req, res) => {
  const data = vehicleSchema.parse(req.body);
  const vin = data.vin ? data.vin.trim().toUpperCase() : null;
  const dup = await db.one(
    'SELECT id FROM vehicles WHERE plate=$1' + (vin ? ' OR vin=$2' : ''),
    vin ? [data.plate.toUpperCase(), vin] : [data.plate.toUpperCase()]
  );
  if (dup) throw new HttpError(409, 'Immatriculation ou VIN déjà enregistré');
  const v = await db.one(
    `INSERT INTO vehicles (owner_id,make,model,year,plate,vin,mileage,initial_mileage,
      generation,engine_name,displacement_cc,fuel_type,gearbox,transmission,first_registration)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [req.user.sub, data.make.trim(), data.model.trim(), data.year,
      data.plate.toUpperCase(), vin, data.mileage,
      data.generation, data.engine_name, data.displacement_cc,
      data.fuel_type, data.gearbox, data.transmission, data.first_registration]
  );
  await db.query(
    `INSERT INTO history_entries (vehicle_id, entry_type, title, details, created_by)
     VALUES ($1,'VEHICLE','Création de la fiche véhicule',$2,$3)`,
    [v.id, JSON.stringify({ plate: v.plate }), req.user.sub]
  );
  await db.query(
    `INSERT INTO maintenance_records (vehicle_id, rule_id, type, label, odometer_km)
     SELECT $1, r.id, 'CONSTRUCTOR', r.label, $4
     FROM maintenance_rules r
     WHERE r.make=$2 AND r.model=$3`,
    [v.id, v.make, v.model, v.initial_mileage]
  );
  res.status(201).json({ vehicle: v });
}));

router.get('/:id', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  res.json({ vehicle: v });
}));

router.patch('/:id', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  if (v.owner_id !== req.user.sub) throw new HttpError(403, 'Seul le propriétaire peut modifier');
  const s = patchSchema.parse(req.body);
  const sets = [];
  const vals = [];
  let idx = 1;
  const fields = ['make','model','year','mileage','generation','engine_name','displacement_cc','fuel_type','gearbox','transmission','first_registration'];
  for (const f of fields) {
    if (s[f] !== undefined) { sets.push(`${f}=$${idx++}`); vals.push(s[f] === null ? null : (typeof s[f] === 'string' ? s[f].trim() : s[f])); }
  }
  if (sets.length === 0) throw new HttpError(400, 'Aucune modification fournie');
  vals.push(v.id);
  const updated = await db.one(
    `UPDATE vehicles SET ${sets.join(', ')} WHERE id=$${idx} RETURNING *`, vals
  );
  await db.query(
    `INSERT INTO history_entries (vehicle_id, entry_type, title, details, created_by)
     VALUES ($1,'MODIFICATION','Modification du véhicule',$2,$3)`,
    [v.id, JSON.stringify({ fields: Object.keys(s).filter(k => s[k] !== undefined) }), req.user.sub]
  );
  res.json({ vehicle: updated });
}));

router.delete('/:id', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  if (v.owner_id !== req.user.sub) throw new HttpError(403, 'Seul le propriétaire peut supprimer');
  const hasIntervention = await db.many('SELECT id FROM interventions WHERE vehicle_id=$1 LIMIT 1', [v.id]);
  if (hasIntervention.length > 0) throw new HttpError(409, 'Impossible de supprimer un véhicule avec des interventions');
  const hasHistory = await db.many('SELECT id FROM history_entries WHERE vehicle_id=$1 LIMIT 1', [v.id]);
  if (hasHistory.length > 0) throw new HttpError(409, 'Suppression impossible : l\'historique du véhicule est immuable (append-only)');
  await db.query('DELETE FROM vehicles WHERE id=$1', [v.id]);
  res.json({ message: 'Véhicule supprimé' });
}));

router.get('/:id/history', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  const parsedLimit = Number(req.query.limit);
  const parsedOffset = Number(req.query.offset);
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const [entries, total] = await Promise.all([
    db.many(
      `SELECT h.*, u.name AS author_name
       FROM history_entries h LEFT JOIN users u ON u.id=h.created_by
       WHERE h.vehicle_id=$1 ORDER BY h.created_at DESC, h.version DESC
       LIMIT $2 OFFSET $3`,
      [v.id, limit, offset]
    ),
    db.one('SELECT count(*)::int AS total FROM history_entries WHERE vehicle_id=$1', [v.id])
  ]);
  res.json({ history: entries, total: total ? total.total : 0, limit, offset });
}));

router.get('/:id/maintenance', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  const o = await maintenanceAI.overview(v);
  const decision = o.decision || {};
  res.json({
    program_constructor: o.program_constructor,
    recommendations_cauto: o.recommendations_cauto,
    all: o.all, next_due: decision.next_due, alerts: decision.alerts,
    score: decision.score, health: decision.overall_status,
    ai_provider: o.provider
  });
}));

// ====== SCORE SANTÉ VÉHICULE (Module 72) ======
router.get('/:id/health-score', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  const [sessions, entries, interventions, maint] = await Promise.all([
    db.many(
      `SELECT * FROM diagnostic_sessions WHERE vehicle_id=$1 ORDER BY created_at DESC`, [v.id]
    ).catch(() => []),
    db.many(
      `SELECT * FROM history_entries WHERE vehicle_id=$1 ORDER BY created_at DESC`, [v.id]
    ).catch(() => []),
    db.many(
      `SELECT * FROM interventions WHERE vehicle_id=$1`, [v.id]
    ).catch(() => []),
    maintenanceAI.overview(v).catch(() => ({ decision: {} }))
  ]);
  const health = await vehicleHealthScoreAI.compute({ vehicle: v, sessions, entries, interventions, maint });
  res.json({
    vehicle_id: v.id,
    health
  });
}));

router.post('/:id/maintenance/records', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  const s = z.object({
    rule_id: z.string().uuid(),
    done_at: z.string().date(),
    odometer_km: z.number().int().min(0)
  }).parse(req.body);
  const rule = await db.one('SELECT * FROM maintenance_rules WHERE id=$1', [s.rule_id]);
  if (!rule) throw new HttpError(404, 'Règle d\'entretien inconnue');
  const rec = await db.one(
    `INSERT INTO maintenance_records (vehicle_id,rule_id,type,label,done_at,odometer_km,created_by)
     VALUES ($1,$2,'ACTUAL',$3,$4,$5,$6) RETURNING *`,
    [v.id, s.rule_id, rule.label, s.done_at, s.odometer_km, req.user.sub]
  );
  if (s.odometer_km > v.mileage) {
    await db.query('UPDATE vehicles SET mileage=$1 WHERE id=$2', [s.odometer_km, v.id]);
  }
  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     VALUES ($1,'MAINTENANCE',$2,$3,$4)`,
    [v.id, `Entretien réalisé : ${rule.label}`,
      JSON.stringify({ odometer_km: s.odometer_km, done_at: s.done_at }), req.user.sub]
  );
  res.status(201).json({ record: rec });
}));

// ====== PASSEPORT VÉHICULE ======
router.get('/:id/passport', wrap(async (req, res) => {
  const v = await ownedVehicle(req);
  const [hist, maint, diags, interventions, warranties] = await Promise.all([
    db.many(
      `SELECT h.*, u.name AS author_name FROM history_entries h
       LEFT JOIN users u ON u.id=h.created_by WHERE h.vehicle_id=$1
       ORDER BY h.created_at DESC LIMIT 50`, [v.id]
    ).catch(() => []),
    maintenanceAI.overview(v).catch(() => ({ decision: {}, all: [], program_constructor: [], recommendations_cauto: [] })),
    db.many(
      `SELECT * FROM diagnostic_sessions WHERE vehicle_id=$1 ORDER BY created_at DESC`, [v.id]
    ).catch(() => []),
    db.many(
      `SELECT i.*, p.name AS pro_name FROM interventions i
       LEFT JOIN professionals pr ON pr.id=i.professional_id
       LEFT JOIN users p ON p.id=pr.user_id
       WHERE i.vehicle_id=$1 ORDER BY i.created_at DESC`, [v.id]
    ).catch(() => []),
    db.many(
      `SELECT w.* FROM warranties w
       JOIN interventions i ON i.id=w.intervention_id
       WHERE i.vehicle_id=$1 ORDER BY w.starts_on DESC`, [v.id]
    ).catch(() => [])
  ]);

  // Synthèse de l'historique (Module 70) : informative, jamais engageante.
  const synth = await vehicleHistoryAI.summarize({
    vehicle: v, entries: hist, diags, interventions,
    warranty: warranties && warranties[0] ? warranties[0] : null
  }).catch(() => ({ decision: {}, detail: {}, provider: {} }));
  const maintDecision = maint.decision || {};
  const aiEnabled = !!(synth.provider && synth.provider.code);
  if (aiEnabled && synth.decision) synth.decision.ai_provider = synth.provider;

  res.json({
    vehicle: v,
    passport: {
      identity: {
        make: v.make, model: v.model, year: v.year, vin: v.vin,
        plate: v.plate, generation: v.generation, engine: v.engine_name,
        displacement: v.displacement_cc, fuel: v.fuel_type,
        gearbox: v.gearbox, transmission: v.transmission,
        first_registration: v.first_registration, mileage: v.mileage
      },
      history: hist,
      maintenance: { score: maintDecision.score, items: maint.all, health: maintDecision.overall_status },
      diagnostics: diags,
      interventions: interventions,
      warranties: warranties,
      ai_summary: synth.decision || {},
      generated_at: new Date().toISOString()
    }
  });
}));

module.exports = router;
