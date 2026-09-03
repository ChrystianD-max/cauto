const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { analyze } = require('../utils/prediagnostics');

const router = express.Router();
router.use(requireAuth);

router.post('/', wrap(async (req, res) => {
  const s = z.object({
    vehicle_id: z.string().uuid(),
    description: z.string().min(5).max(4000)
  }).parse(req.body);
  const v = await db.one('SELECT * FROM vehicles WHERE id=$1', [s.vehicle_id]);
  if (!v) throw new HttpError(404, 'Véhicule introuvable');
  if (v.owner_id !== req.user.sub) throw new HttpError(403, 'Seul le propriétaire peut déclarer un problème');
  const issue = await db.one(
    'INSERT INTO issues (vehicle_id, description) VALUES ($1,$2) RETURNING *',
    [v.id, s.description.trim()]
  );
  const a = analyze(s.description);
  const pre = await db.one(
    `INSERT INTO prediagnostics (issue_id, severity, summary, causes, recommendations)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [issue.id, a.severity, a.summary, JSON.stringify(a.causes), JSON.stringify(a.recommendations)]
  );
  await db.query(
    `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
     VALUES ($1,'ISSUE','Problème déclaré',$2,$3)`,
    [v.id, JSON.stringify({ issue: issue.id, description: s.description.slice(0, 200) }), req.user.sub]
  );
  res.status(201).json({ issue, prediagnostic: pre });
}));

module.exports = router;
