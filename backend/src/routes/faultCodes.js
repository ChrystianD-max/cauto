const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
  const { q, system, severity, limit } = req.query;
  const max = Math.min(parseInt(limit) || 50, 100);
  let sql = `SELECT fc.*, fcs.name AS system_name
    FROM fault_codes fc
    LEFT JOIN fault_code_systems fcs ON fcs.id = fc.system_id`;
  const params = [];
  const wheres = [];
  if (q) { params.push('%' + q.toUpperCase() + '%'); wheres.push(`fc.code ILIKE $${params.length}`); }
  if (system) { params.push(system); wheres.push(`fcs.code_prefix = $${params.length}`); }
  if (severity) { params.push(severity); wheres.push(`fc.severity = $${params.length}`); }
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
  sql += ` ORDER BY fc.code ASC LIMIT $${params.length + 1}`;
  params.push(max);
  const rows = await db.many(sql, params);
  res.json({ fault_codes: rows, total: rows.length });
}));

router.get('/systems', wrap(async (req, res) => {
  const rows = await db.many('SELECT * FROM fault_code_systems ORDER BY code_prefix');
  res.json({ systems: rows });
}));

router.get('/:code', wrap(async (req, res) => {
  const code = req.params.code.toUpperCase().trim();
  const fc = await db.one(
    `SELECT fc.*, fcs.name AS system_name, fcs.description AS system_description
     FROM fault_codes fc
     LEFT JOIN fault_code_systems fcs ON fcs.id = fc.system_id
     WHERE fc.code = $1`, [code]
  );
  if (!fc) throw new HttpError(404, 'Code défaut introuvable');
  const [causes, tests] = await Promise.all([
    db.many(
      'SELECT * FROM fault_code_causes WHERE fault_code_id=$1 ORDER BY sort_order, probability DESC',
      [fc.id]
    ).catch(() => []),
    db.many(
      'SELECT * FROM fault_code_tests WHERE fault_code_id=$1 ORDER BY sort_order',
      [fc.id]
    ).catch(() => [])
  ]);
  res.json({ fault_code: { ...fc, causes, tests } });
}));

module.exports = router;
