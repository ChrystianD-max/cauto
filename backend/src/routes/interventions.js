const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { audit } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');
const storage = require('../services/storage');

const router = express.Router();
router.use(requireAuth);

router.get('/mine', wrap(async (req, res) => {
  const isPro = ['GARAGE', 'MECANICIEN'].includes(req.user.role);
  let sql, params;
  if (isPro) {
    params = [req.user.sub];
    sql = `SELECT i.*, v.plate, v.make, v.model FROM interventions i
           JOIN vehicles v ON v.id=i.vehicle_id
           JOIN professionals p ON p.id=i.professional_id
           WHERE p.user_id=$1 ORDER BY i.created_at DESC`;
  } else {
    params = [req.user.sub];
    sql = `SELECT i.*, v.plate, v.make, v.model FROM interventions i
           JOIN vehicles v ON v.id=i.vehicle_id
           JOIN users u ON u.id=v.owner_id
           WHERE u.id=$1 ORDER BY i.created_at DESC`;
  }
  const interventions = await db.many(sql, params);
  res.json({ interventions });
}));

async function loadIntervention(req) {
  const i = await db.one(
    `SELECT i.*, v.owner_id, v.plate FROM interventions i
     JOIN vehicles v ON v.id=i.vehicle_id WHERE i.id=$1`,
    [req.params.id]
  );
  if (!i) throw new HttpError(404, 'Intervention introuvable');
  const pro = await db.one('SELECT * FROM professionals WHERE id=$1', [i.professional_id]);
  const isOwner = i.owner_id === req.user.sub;
  const isAssignedPro = pro && pro.user_id === req.user.sub;
  const isAdmin = req.user.role === 'ADMIN';
  if (!isOwner && !isAssignedPro && !isAdmin) throw new HttpError(403, 'Accès refusé à cette intervention');
  req.intervention = i;
  req.isProSide = Boolean(isAssignedPro);
  return i;
}

router.get('/:id', wrap(async (req, res) => {
  await loadIntervention(req);
  const diag = await db.one('SELECT * FROM diagnostics WHERE intervention_id=$1', [req.intervention.id]);
  const quoteRows = await db.many('SELECT q.*, (SELECT json_agg(qi.*) FROM quote_items qi WHERE qi.quote_id=q.id) AS items FROM quotes q WHERE q.intervention_id=$1', [req.intervention.id]);
  const quote = quoteRows[0] || null;
  const extras = await db.many('SELECT * FROM extra_work_requests WHERE intervention_id=$1 ORDER BY created_at DESC', [req.intervention.id]);
  const orderRows = await db.many('SELECT * FROM repair_orders WHERE intervention_id=$1', [req.intervention.id]);
  const order = orderRows[0] || null;
  const tasks = order ? await db.many('SELECT * FROM tasks WHERE repair_order_id=$1 ORDER BY created_at', [order.id]) : [];
  const qcRows = await db.many('SELECT * FROM quality_checks WHERE intervention_id=$1', [req.intervention.id]);
  const qc = qcRows[0] || null;
  const warrantyRows = await db.many('SELECT * FROM warranties WHERE intervention_id=$1', [req.intervention.id]);
  const warranty = warrantyRows[0] || null;
  const evidences = await db.many('SELECT id,kind,filename,mime,size,created_at FROM evidences WHERE intervention_id=$1 ORDER BY created_at', [req.intervention.id]);
  const ratingRows = await db.many('SELECT stars,comment,created_at FROM ratings WHERE intervention_id=$1', [req.intervention.id]);
  const rating = ratingRows[0] || null;
  res.json({
    intervention: req.intervention,
    diagnostic: diag,
    quote,
    extra_works: extras,
    repair_order: order ? { ...order, tasks } : null,
    quality_check: qc,
    warranty,
    evidences,
    rating
  });
}));

// ---- Diagnostic (professionnel uniquement ; le client ne peut pas le modifier)
router.post('/:id/diagnostic', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  await loadIntervention(req);
  if (!req.isProSide) throw new HttpError(403, 'Diagnostic réservé au professionnel en charge');
  const s = z.object({ content: z.string().min(5).max(8000) }).parse(req.body);
  const existing = await db.one('SELECT id FROM diagnostics WHERE intervention_id=$1', [req.intervention.id]);
  if (existing) throw new HttpError(409, 'Un diagnostic existe déjà pour cette intervention');
  const diag = await db.one(
    'INSERT INTO diagnostics (intervention_id, author_id, content) VALUES ($1,$2,$3) RETURNING *',
    [req.intervention.id, req.user.sub, s.content.trim()]
  );
  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     VALUES ($1,'DIAGNOSTIC','Diagnostic établi',$2,$3)`,
    [req.intervention.vehicle_id, JSON.stringify({ intervention_id: req.intervention.id }), req.user.sub]
  );
  await db.query(
    `INSERT INTO notifications (user_id,message,dedupe_key)
     VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
    [req.intervention.owner_id, 'Diagnostic disponible pour votre véhicule', `intv:${req.intervention.id}:diag`]
  );
  await audit(req, 'diagnostic.create', 'diagnostic', diag.id, {});
  res.status(201).json({ diagnostic: diag });
}));

// ---- Preuves (photos/documents)
fs.mkdirSync(config.uploadDir, { recursive: true });
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, config.uploadDir),
    filename: (_r, f, cb) => {
      const ext = path.extname(f.originalname || '').toLowerCase().slice(0, 8);
      cb(null, crypto.randomBytes(16).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new HttpError(415, 'Type de fichier non autorisé'));
    cb(null, true);
  }
});

router.post('/:id/evidence', requireRole('GARAGE', 'MECANICIEN'), upload.single('file'),
  wrap(async (req, res) => {
    await loadIntervention(req);
    if (!req.isProSide) throw new HttpError(403, 'Réservé au professionnel');
    if (!req.file) throw new HttpError(400, 'Fichier manquant (champ "file")');
    const kind = req.body.kind === 'DOC' ? 'DOC' : 'PHOTO';
    const ev = await db.one(
      `INSERT INTO evidences (intervention_id,kind,filename,mime,size,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,kind,filename,mime,size,created_at`,
      [req.intervention.id, kind, req.file.filename, req.file.mimetype, req.file.size, req.user.sub]
    );
    if (storage.isS3()) {
      try {
        await storage.replicate('evidence', req.file.filename, req.file.path);
      } catch (e) {
        await db.query('DELETE FROM evidences WHERE id=$1', [ev.id]).catch(() => {});
        await storage.remove('evidence', req.file.filename);
        console.error('[STORAGE]', e.message || e);
        throw new HttpError(500, 'Le stockage objet est momentanément indisponible');
      }
    }
    res.status(201).json({ evidence: ev });
  })
);

router.get('/evidences/:fileId/raw', wrap(async (req, res, next) => {
  const ev = await db.one('SELECT * FROM evidences WHERE id=$1', [req.params.fileId]);
  if (!ev) return next(new HttpError(404, 'Preuve introuvable'));
  await loadIntervention({ ...req, params: { id: ev.intervention_id } });
  res.setHeader('Content-Type', ev.mime);
  const open = await storage.open('evidence', ev.filename);
  if (!open) throw new HttpError(404, 'Preuve introuvable');
  if (open.type === 'file') return res.sendFile(open.abs);
  if (open.size) res.setHeader('Content-Length', open.size);
  open.stream.on('error', () => res.end());
  open.stream.pipe(res);
}));

// ---- Devis
router.post('/:id/quote', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  await loadIntervention(req);
  if (!req.isProSide) throw new HttpError(403, 'Devis réservé au professionnel');
  const s = z.object({
    items: z.array(z.object({
      label: z.string().min(1).max(200),
      kind: z.enum(['PARTS', 'LABOR']),
      qty: z.number().positive().default(1),
      unit_price_cents: z.number().int().min(0).max(100000000)
    })).min(1),
    is_complementary: z.boolean().default(false),
    complementary_message: z.string().max(2000).nullable().optional()
  }).parse(req.body);
  if (req.intervention.status !== 'DIAGNOSTIC' && req.intervention.status !== 'QUOTE_SENT') {
    throw new HttpError(409, 'Devis non autorisé à ce stade');
  }
  const total = s.items.reduce((sum, it) => sum + Math.round(it.qty * it.unit_price_cents), 0);
  const quote = await db.tx(async (c) => {
    const exists = await c.query('SELECT id FROM quotes WHERE intervention_id=$1', [req.intervention.id]);
    if (exists.rows[0]) throw new HttpError(409, 'Un devis existe déjà');
    const q = await c.query(
      `INSERT INTO quotes (intervention_id,total_cents,original_total_cents,created_by,is_complementary,complementary_message)
       VALUES ($1,$2,$2,$3,$4,$5) RETURNING *`,
      [req.intervention.id, total, req.user.sub, s.is_complementary, s.complementary_message || null]
    );
    for (const it of s.items) {
      await c.query(
        `INSERT INTO quote_items (quote_id,label,kind,qty,unit_price_cents) VALUES ($1,$2,$3,$4,$5)`,
        [q.rows[0].id, it.label, it.kind, it.qty, it.unit_price_cents]
      );
    }
    await c.query(`UPDATE interventions SET status='QUOTE_SENT' WHERE id=$1`, [req.intervention.id]);
    await c.query(
      `UPDATE service_requests SET status='QUOTE_SENT', updated_at=NOW()
       WHERE intervention_id=$1 OR (vehicle_id=$2 AND status='DIAGNOSIS')`,
      [req.intervention.id, req.intervention.vehicle_id]
    ).catch(() => {});
    return q.rows[0];
  });
  await db.query(
    `INSERT INTO notifications (user_id,message,dedupe_key)
     VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
    [req.intervention.owner_id,
     (s.is_complementary
       ? `Devis complémentaire reçu : ${(total / 100).toFixed(2)} € — ${s.complementary_message || 'validation requise'}`
       : `Devis reçu : ${(total / 100).toFixed(2)} — validation requise`),
     `intv:${req.intervention.id}:quote${s.is_complementary ? '-compl' : ''}`]
  );
  await audit(req, 'quote.create', 'quote', quote.id, { total_cents: total });
  res.status(201).json({ quote });
}));

router.post('/quotes/:quoteId/decision', wrap(async (req, res) => {
  const q = await db.one(
    `SELECT q.*, v.owner_id FROM quotes q JOIN interventions i ON i.id=q.intervention_id JOIN vehicles v ON v.id=i.vehicle_id WHERE q.id=$1`,
    [req.params.quoteId]
  );
  if (q.owner_id !== req.user.sub) throw new HttpError(403, 'Seul le client peut décider');
  if (q.status !== 'PENDING') throw new HttpError(409, 'Décision déjà enregistrée');
  const s = z.object({ approve: z.boolean() }).parse(req.body);
  const status = s.approve ? 'APPROVED' : 'REFUSED';
  await db.tx(async (c) => {
    await c.query(`UPDATE quotes SET status=$1, decided_at=now() WHERE id=$2`, [status, q.id]);
    await c.query(`UPDATE interventions SET status='QUOTE_APPROVED' WHERE id=$1 AND $2='APPROVED'`, [q.intervention_id, status]);
  });
  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     SELECT vehicle_id,'QUOTE',$1,$2,$3 FROM interventions WHERE id=$4`,
    [s.approve ? 'Devis validé par le client' : 'Devis refusé par le client',
      JSON.stringify({ quote_id: q.id }), req.user.sub, q.intervention_id]
  );
  await audit(req, 'quote.decision', 'quote', q.id, { approve: s.approve });
  res.json({ status });
}));

// ---- Travaux supplémentaires (autorisation client obligatoire)
router.post('/:id/extra-work', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  await loadIntervention(req);
  if (!req.isProSide) throw new HttpError(403, 'Réservé au professionnel');
  const s = z.object({
    label: z.string().min(2).max(200),
    explanation: z.string().min(5).max(4000),
    parts_cents: z.number().int().min(0),
    labor_cents: z.number().int().min(0),
    delay_days: z.number().int().min(0).max(365),
    evidence_ids: z.array(z.string().uuid()).max(20).default([])
  }).parse(req.body);
  const extra = await db.one(
    `INSERT INTO extra_work_requests
       (intervention_id,label,explanation,parts_cents,labor_cents,delay_days,evidence_ids)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.intervention.id, s.label, s.explanation, s.parts_cents, s.labor_cents,
      s.delay_days, JSON.stringify(s.evidence_ids)]
  );
  await db.query(
    `INSERT INTO notifications (user_id,message,dedupe_key)
     VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
    [req.intervention.owner_id, `Travaux supplémentaires proposés : ${s.label} — votre autorisation est requise`,
      `extra:${extra.id}:pending`]
  );
  await audit(req, 'extra_work.request', 'extra_work_request', extra.id, {});
  res.status(201).json({ extra_work: extra });
}));

router.post('/extra-works/:extraId/decision', wrap(async (req, res) => {
  const e = await db.one(
    `SELECT e.*, v.owner_id FROM extra_work_requests e
     JOIN interventions i ON i.id=e.intervention_id JOIN vehicles v ON v.id=i.vehicle_id WHERE e.id=$1`,
    [req.params.extraId]
  );
  if (!e) throw new HttpError(404, 'Demande introuvable');
  if (e.owner_id !== req.user.sub) throw new HttpError(403, 'Seul le client peut autoriser ou refuser');
  if (e.status !== 'PENDING') throw new HttpError(409, 'Décision déjà enregistrée');
  const s = z.object({ approve: z.boolean() }).parse(req.body);
  const status = s.approve ? 'APPROVED' : 'REFUSED';
  await db.query(`UPDATE extra_work_requests SET status=$1, decided_at=now() WHERE id=$2`, [status, e.id]);
  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     SELECT vehicle_id,'EXTRA_WORK',$1,$2,$3 FROM interventions WHERE id=$4`,
    [s.approve ? 'Travaux supplémentaires autorisés' : 'Travaux supplémentaires REFUSÉS par le client',
      JSON.stringify({ extra_id: e.id, label: e.label }), req.user.sub, e.intervention_id]
  );
  await audit(req, 'extra_work.decision', 'extra_work_request', e.id, { approve: s.approve });
  res.json({ status });
}));

// ---- Ordre de réparation
router.post('/:id/repair-order', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  await loadIntervention(req);
  if (!req.isProSide) throw new HttpError(403, 'Réservé au professionnel');
  if (req.intervention.status !== 'QUOTE_APPROVED') {
    throw new HttpError(409, 'Le devis doit être validé par le client avant création de l\'ordre');
  }
  const order = await db.one(
    'INSERT INTO repair_orders (intervention_id) VALUES ($1) RETURNING *',
    [req.intervention.id]
  );
  await db.query(`UPDATE interventions SET status='REPAIRING' WHERE id=$1`, [req.intervention.id]);
  await audit(req, 'repair_order.create', 'repair_order', order.id, {});
  res.status(201).json({ repair_order: order });
}));

// Ajout de travaux : un travail lié à des travaux supplémentaires exige leur APPROBATION explicite.
// Un REFUS bloque définitivement l'exécution de cette opération.
router.post('/:id/tasks', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  await loadIntervention(req);
  if (!req.isProSide) throw new HttpError(403, 'Réservé au professionnel');
  const s = z.object({
    label: z.string().min(1).max(200),
    extra_request_id: z.string().uuid().optional()
  }).parse(req.body);
  const order = await db.one('SELECT * FROM repair_orders WHERE intervention_id=$1', [req.intervention.id]);
  if (!order) throw new HttpError(409, "Aucun ordre de réparation ouvert");
  let task;
  if (s.extra_request_id) {
    const e = await db.one('SELECT * FROM extra_work_requests WHERE id=$1 AND intervention_id=$2',
      [s.extra_request_id, req.intervention.id]);
    if (!e) throw new HttpError(404, 'Travaux supplémentaires introuvables');
    if (e.status === 'REFUSED') {
      throw new HttpError(403, 'Travaux supplémentaires REFUSÉS par le client : exécution interdite');
    }
    if (e.status === 'PENDING') {
      throw new HttpError(403, "Autorisation du client en attente : impossible d'exécuter ces travaux");
    }
    task = await db.one(
      'INSERT INTO tasks (repair_order_id,extra_request_id,label) VALUES ($1,$2,$3) RETURNING *',
      [order.id, e.id, s.label]
    );
  } else {
    task = await db.one(
      'INSERT INTO tasks (repair_order_id,label) VALUES ($1,$2) RETURNING *',
      [order.id, s.label]
    );
  }
  res.status(201).json({ task });
}));

router.post('/tasks/:taskId/done', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  const t = await db.one(
    `SELECT t.*, ro.intervention_id FROM tasks t
     JOIN repair_orders ro ON ro.id=t.repair_order_id WHERE t.id=$1`,
    [req.params.taskId]
  );
  if (!t) throw new HttpError(404, 'Tâche introuvable');
  const fakeReq = { ...req, params: { id: t.intervention_id } };
  await loadIntervention(fakeReq);
  if (!fakeReq.isProSide) throw new HttpError(403, 'Réservé au professionnel');
  const updated = await db.one('UPDATE tasks SET done=true WHERE id=$1 RETURNING *', [t.id]);
  res.json({ task: updated });
}));

// ---- Contrôle qualité puis clôture
router.post('/:id/quality-control', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  await loadIntervention(req);
  if (!req.isProSide) throw new HttpError(403, 'Réservé au professionnel');
  if (req.intervention.status !== 'REPAIRING') throw new HttpError(409, 'Réparation non démarrée');
  const s = z.object({
    passed: z.boolean(),
    notes: z.string().max(2000).default(''),
    checklist: z.record(z.boolean()).default({})
  }).parse(req.body);
  if (!s.passed) throw new HttpError(422, 'Contrôle qualité échoué : corriger avant clôture');
  const qc = await db.one(
    `INSERT INTO quality_checks (intervention_id,passed,notes,checklist,checked_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.intervention.id, s.passed, s.notes, JSON.stringify(s.checklist), req.user.sub]
  );
  await db.query(`UPDATE interventions SET status='QUALITY_CHECK' WHERE id=$1`, [req.intervention.id]);
  res.status(201).json({ quality_check: qc });
}));

router.post('/:id/close', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
  await loadIntervention(req);
  if (!req.isProSide) throw new HttpError(403, 'Réservé au professionnel');
  const qc = await db.one('SELECT passed FROM quality_checks WHERE intervention_id=$1', [req.intervention.id]);
  if (!qc || !qc.passed) throw new HttpError(409, 'Contrôle qualité validé requis avant clôture');
  await db.tx(async (c) => {
    await c.query(`UPDATE interventions SET status='CLOSED' WHERE id=$1`, [req.intervention.id]);
    await c.query(`UPDATE repair_orders SET status='CLOSED' WHERE intervention_id=$1`, [req.intervention.id]);
    await c.query(`UPDATE appointments SET status='DONE' WHERE id=$1`, [req.intervention.appointment_id]);
  });
  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     VALUES ($1,'INTERVENTION','Intervention clôturée',$2,$3)`,
    [req.intervention.vehicle_id, JSON.stringify({ intervention_id: req.intervention.id }), req.user.sub]
  );
  await audit(req, 'intervention.close', 'intervention', req.intervention.id, {});
  res.json({ status: 'CLOSED' });
}));

module.exports = router;
