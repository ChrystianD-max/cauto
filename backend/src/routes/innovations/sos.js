const express = require('express');
const db = require('../../db');
const { requireAuth } = require('../../middlewares/auth');
const { HttpError, wrap } = require('../../utils/errors');
const { validate, z } = require('../../utils/validate');

const router = express.Router();
router.use(requireAuth);

const createSosSchema = z.object({
  vehicle_id: z.string().uuid().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address: z.string().max(300).optional(),
  problem: z.string().max(500).optional(),
  radius_km: z.coerce.number().min(1).max(100).optional()
}).passthrough();

// ---------- #3 Assistance SOS / dépannage ----------

// Créer une demande SOS
router.post('/', validate(createSosSchema), wrap(async (req, res) => {
  if (req.user.role !== 'CLIENT') throw new HttpError(403, 'Réservé aux clients');

  const active = await db.query(
    `SELECT id FROM sos_requests WHERE user_id=$1 AND status IN ('ACTIVE','FOUND')`,
    [req.user.sub]
  );
  if (active.rows.length > 0) throw new HttpError(400, 'Vous avez déjà une demande SOS active');

  const sos = await db.one(
    `INSERT INTO sos_requests
       (user_id, vehicle_id, latitude, longitude, address, problem, radius_km, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '30 minutes')
     RETURNING *`,
    [req.user.sub, req.body.vehicle_id || null, req.body.latitude, req.body.longitude,
     req.body.address || null, req.body.problem || null, req.body.radius_km || 20]
  );

  const nearby = await db.many(
    `SELECT p.id, p.name, p.latitude, p.longitude,
            p.rating, p.rating_count, p.specialty
     FROM professionals p
     WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
       AND p.is_available = true
       AND earth_distance(
             ll_to_earth(p.latitude, p.longitude),
             ll_to_earth($1, $2)
           ) <= $3 * 1000
     ORDER BY earth_distance(ll_to_earth(p.latitude, p.longitude), ll_to_earth($1, $2))`,
    [req.body.latitude, req.body.longitude, req.body.radius_km || 20]
  ).catch(() => []);

  const matches = [];
  for (const pro of nearby.slice(0, 5)) {
    const dist = await db.one(
      `SELECT earth_distance(ll_to_earth($1, ll_to_earth($2,$3))) / 1000 AS dist`,
      [pro.id, req.body.latitude, req.body.longitude]
    ).catch(() => ({ dist: null }));
    const m = await db.one(
      `INSERT INTO sos_matches (sos_id, professional_id, distance_km, score)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [sos.id, pro.id, parseFloat(dist.dist) || null,
       Math.round((1 / (1 + (parseFloat(dist.dist) || 10))) * 100) / 100]
    );
    m.professional = pro;
    matches.push(m);
  }

  if (matches.length > 0) {
    await db.query(`UPDATE sos_requests SET status='FOUND', matched_professional_id=$1 WHERE id=$2`,
      [matches[0].professional_id, sos.id]);
    sos.status = 'FOUND';
    sos.matched_professional_id = matches[0].professional_id;
  }

  res.json({ sos, matches });
}));

// Lister mes demandes SOS
router.get('/', wrap(async (req, res) => {
  const sos = await db.many(
    'SELECT * FROM sos_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20',
    [req.user.sub]
  );
  res.json({ sos_requests: sos });
}));

// Détail SOS
router.get('/:id', wrap(async (req, res) => {
  const sos = await db.one(
    'SELECT * FROM sos_requests WHERE id=$1', [req.params.id]
  ).catch(() => null);
  if (!sos) throw new HttpError(404, 'Demande SOS introuvable');
  if (sos.user_id !== req.user.sub && req.user.role !== 'ADMIN') {
    throw new HttpError(403, 'Accès refusé');
  }
  const matches = await db.many(
    `SELECT sm.*, p.name, p.phone, p.specialty, p.rating
     FROM sos_matches sm JOIN professionals p ON sm.professional_id = p.id
     WHERE sm.sos_id=$1`, [req.params.id]
  ).catch(() => []);
  res.json({ sos, matches });
}));

// Annuler une SOS
router.post('/:id/cancel', wrap(async (req, res) => {
  const sos = await db.one(
    'SELECT * FROM sos_requests WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.sub]
  ).catch(() => null);
  if (!sos) throw new HttpError(404, 'Demande SOS introuvable');
  if (!['ACTIVE', 'FOUND'].includes(sos.status)) {
    throw new HttpError(400, 'Demande déjà terminée');
  }
  await db.query(`UPDATE sos_requests SET status='CANCELLED' WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
}));

// Pro: répondre à un match SOS
router.post('/:id/respond', wrap(async (req, res) => {
  if (!['GARAGE', 'MECANICIEN', 'ADMIN'].includes(req.user.role)) {
    throw new HttpError(403, 'Réservé aux professionnels');
  }
  const proId = await db.one(
    'SELECT id FROM professionals WHERE user_id=$1', [req.user.sub]
  ).catch(() => null);
  if (!proId) throw new HttpError(400, 'Profil professionnel non trouvé');

  const match = await db.one(
    `UPDATE sos_matches SET status='ACCEPTED', responded_at=now()
     WHERE sos_id=$1 AND professional_id=$2 AND status='SUGGESTED' RETURNING *`,
    [req.params.id, proId.id]
  ).catch(() => null);
  if (!match) throw new HttpError(404, 'Aucun match trouvé');

  await db.query(
    `UPDATE sos_requests SET status='ACCEPTED', matched_professional_id=$1 WHERE id=$2`,
    [proId.id, req.params.id]
  );

  res.json({ match });
}));

// Résolution SOS (client ou pro)
router.post('/:id/resolve', wrap(async (req, res) => {
  const sos = await db.one('SELECT * FROM sos_requests WHERE id=$1', [req.params.id]).catch(() => null);
  if (!sos) throw new HttpError(404, 'Demande SOS introuvable');
  await db.query(`UPDATE sos_requests SET status='RESOLVED', resolved_at=now() WHERE id=$1`, [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;