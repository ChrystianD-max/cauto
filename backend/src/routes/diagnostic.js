const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const tenancy = require('../utils/tenancy');
const { services: { diagnosticAI } } = require('../services/ai');
const DiagnosticAI = require('../services/ai/services/DiagnosticAI');

const router = express.Router();
router.use(requireAuth);

router.get('/categories', wrap(async (req, res) => {
  const cats = Object.entries(DiagnosticAI.CATEGORIES).map(([key, val]) => ({
    id: key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    keywords: val.keywords.slice(0, 5)
  }));
  res.json({ categories: cats });
}));

router.post('/', wrap(async (req, res) => {
  const schema = z.object({
    vehicle_id: z.string().uuid(),
    category: z.string().min(1),
    symptom_text: z.string().min(3).max(2000),
    symptom_photos: z.array(z.string()).max(5).optional().default([]),
    symptom_video_url: z.string().max(500).optional().default(''),
    symptom_audio_url: z.string().max(500).optional().default(''),
    dtc_codes: z.array(z.string().max(10)).max(20).optional().default([])
  });
  const data = schema.parse(req.body);

  const vehicle = await db.one('SELECT * FROM vehicles WHERE id=$1', [data.vehicle_id]);
  if (!vehicle) throw new HttpError(404, 'Véhicule introuvable');
  const allowed = await tenancy.canAccessVehicle(req.user.sub, req.user.role, vehicle);
  if (!allowed) throw new HttpError(403, 'Accès refusé');

  let category = data.category;
  if (!DiagnosticAI.CATEGORIES[category]) {
    category = DiagnosticAI.extractCategory(data.symptom_text);
  }

  const prevDiags = await db.many(
    'SELECT symptom_text FROM diagnostic_sessions WHERE vehicle_id=$1 ORDER BY created_at DESC LIMIT 5',
    [data.vehicle_id]
  ).catch(() => []);

  // Décision TOUJOURS produite par le fournisseur de règles ; un fournisseur
  // externe n'ajoute qu'un `insight` non engageant (Module 70 ARCHITECTURE IA).
  const result = await diagnosticAI.analyse({
    text: data.symptom_text, category, dtcCodes: data.dtc_codes, vehicleHistory: prevDiags
  });

  const session = await db.one(
    `INSERT INTO diagnostic_sessions
      (vehicle_id, user_id, category, symptom_text, symptom_photos, symptom_video_url, symptom_audio_url, dtc_codes,
       result_comprehension, result_hypotheses, result_causes, result_controls, result_urgency, result_confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [data.vehicle_id, req.user.sub, category, data.symptom_text,
     data.symptom_photos, data.symptom_video_url, data.symptom_audio_url, data.dtc_codes,
     result.result_comprehension, JSON.stringify(result.result_hypotheses),
     JSON.stringify(result.result_causes), JSON.stringify(result.result_controls),
     result.result_urgency, result.result_confidence]
  );

  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     VALUES ($1,'DIAGNOSTIC',$2,$3,$4)`,
    [data.vehicle_id, `Diagnostic: ${category}`,
      JSON.stringify({ category, urgency: result.result_urgency, confidence: result.result_confidence }),
      req.user.sub]
  );

  res.status(201).json({
    session,
    ai_provider: result.provider,
    expertise: {
      doctrine: result.result_doctrine,
      dtc: result.result_dtc || [],
      method: result.result_method,
      critical_causes: result.result_critical_causes || [],
      confirmation: result.result_confirmation,
      root_cause_alternatives: result.result_root_cause_alt || [],
      reduce_parts: result.result_reduce_parts
    }
  });
}));

router.get('/vehicle/:vehicleId', wrap(async (req, res) => {
  const sessions = await db.many(
    `SELECT * FROM diagnostic_sessions WHERE vehicle_id=$1 ORDER BY created_at DESC`,
    [req.params.vehicleId]
  );
  res.json({ sessions });
}));

module.exports = router;
