const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const { requireAuth } = require('../../middlewares/auth');
const { HttpError, wrap } = require('../../utils/errors');
const { validate, z } = require('../../utils/validate');

const router = express.Router();
router.use(requireAuth);

const mediaSchema = z.object({
  type: z.enum(['PHOTO', 'VIDEO']),
  url: z.string().min(1).max(500),
  caption: z.string().max(200).optional()
}).passthrough();

// ---------- #1 Avis photo/vidéo vérifiés ----------

// Ajout d'un média (photo/vidéo) à un avis posé par soi-même
router.post('/:id/media', validate(mediaSchema), wrap(async (req, res) => {
  const rating = await db.one(
    'SELECT * FROM ratings WHERE id=$1 AND author_id=$2',
    [req.params.id, req.user.sub]
  ).catch(() => null);
  if (!rating) throw new HttpError(404, 'Avis introuvable (ou non autorisé)');

  const media = Array.isArray(rating.media) ? rating.media : [];
  media.push({
    id: crypto.randomBytes(8).toString('hex'),
    type: req.body.type,
    url: req.body.url,
    caption: req.body.caption || null,
    created_at: new Date().toISOString()
  });

  await db.query('UPDATE ratings SET media=$1 WHERE id=$2', [JSON.stringify(media), req.params.id]);
  res.json({ media });
}));

// Retourne les avis d'un professionnel avec médias + badge vérifié
router.get('/professional/:professionalId', wrap(async (req, res) => {
  const ratings = await db.many(
    `SELECT r.*, u.name AS author_name, v.make, v.model
     FROM ratings r
     JOIN users u ON r.author_id = u.id
     LEFT JOIN interventions i ON r.intervention_id = i.id
     LEFT JOIN vehicles v ON i.vehicle_id = v.id
     WHERE r.professional_id = $1
     ORDER BY r.created_at DESC LIMIT 100`,
    [req.params.professionalId]
  );
  res.json({ ratings });
}));

// Détail d'un avis enrichi média + vérification
router.get('/:id', wrap(async (req, res) => {
  const rating = await db.one(
    `SELECT r.*, u.name AS author_name
     FROM ratings r JOIN users u ON r.author_id = u.id
     WHERE r.id = $1`,
    [req.params.id]
  ).catch(() => null);
  if (!rating) throw new HttpError(404, 'Avis introuvable');
  rating.media = rating.media || [];
  res.json({ rating });
}));

// Marque l'avis comme vérifié si une intervention liée est CLOSED (preuve d'une vraie prestation)
router.post('/:id/verify', wrap(async (req, res) => {
  const rating = await db.one(
    'SELECT * FROM ratings WHERE id=$1 AND author_id=$2',
    [req.params.id, req.user.sub]
  ).catch(() => null);
  if (!rating) throw new HttpError(404, 'Avis introuvable (ou non autorisé)');

  let confirmed = false;
  if (rating.intervention_id) {
    const inter = await db.one(
      'SELECT status FROM interventions WHERE id=$1', [rating.intervention_id]
    ).catch(() => null);
    confirmed = !!(inter && inter.status === 'CLOSED');
  }

  const marked = await db.one(
    `UPDATE ratings SET verified=$1, verified_at=CASE WHEN $1 THEN now() ELSE verified_at END,
       intervention_confirmed=$1 WHERE id=$2 RETURNING *`,
    [confirmed, req.params.id]
  );

  res.json({ rating: marked, verified: confirmed });
}));

module.exports = router;