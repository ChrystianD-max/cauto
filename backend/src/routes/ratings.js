const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { validate, z } = require('../utils/validate');

const router = express.Router();

const createRatingSchema = z.object({
  intervention_id: z.string().min(1).optional(),
  professional_id: z.string().min(1).nullish(),
  service_request_id: z.string().min(1).nullish(),
  overall_stars: z.coerce.number().int().min(1).max(5, 'Note entre 1 et 5'),
  comment: z.string().max(2000).optional(),
  quality_stars: z.coerce.number().int().min(1).max(5).optional(),
  delay_stars: z.coerce.number().int().min(1).max(5).optional(),
  communication_stars: z.coerce.number().int().min(1).max(5).optional(),
  price_stars: z.coerce.number().int().min(1).max(5).optional(),
  transparency_stars: z.coerce.number().int().min(1).max(5).optional()
}).passthrough();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
    const { professional_id, min_stars } = req.query;
    const params = [req.user.sub];
    let sql = `
        SELECT r.*, u.name as author_name, v.make, v.model
        FROM ratings r
        JOIN users u ON r.author_id = u.id
        LEFT JOIN interventions i ON r.intervention_id = i.id
        LEFT JOIN vehicles v ON i.vehicle_id = v.id
        WHERE r.author_id = $1
    `;

    if (professional_id) {
        params.push(professional_id);
        sql = sql.replace('WHERE r.author_id = $1', `WHERE r.professional_id = $${params.length}`);
        sql += ` AND r.author_id = $1`;
    }

    if (min_stars) {
        params.push(parseInt(min_stars));
        sql += ` AND r.overall_stars >= $${params.length}`;
    }

    sql += ' ORDER BY r.created_at DESC';
    const ratings = await db.many(sql, params);
    res.json({ ratings });
}));

router.post('/', validate(createRatingSchema), wrap(async (req, res) => {
    if (req.user.role !== 'CLIENT') throw new HttpError(403, 'Seuls les clients peuvent noter');

    const { intervention_id, professional_id, service_request_id,
            quality_stars, delay_stars, communication_stars,
            price_stars, transparency_stars, overall_stars, comment } = req.body;

    if (!overall_stars) throw new HttpError(400, 'La note globale est requise');

    const existing = await db.query(
        'SELECT id FROM ratings WHERE author_id = $1 AND intervention_id = $2',
        [req.user.sub, intervention_id]
    );
    if (existing.rows.length > 0) throw new HttpError(400, 'Vous avez deja note cette intervention');

    const rating = await db.one(
        `INSERT INTO ratings (intervention_id, author_id, professional_id, service_request_id,
            stars, comment, quality_stars, delay_stars, communication_stars,
            price_stars, transparency_stars, overall_stars)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [intervention_id, req.user.sub, professional_id || null, service_request_id || null,
         overall_stars, comment || '', quality_stars || null, delay_stars || null,
         communication_stars || null, price_stars || null, transparency_stars || null, overall_stars]
    );

    if (professional_id) {
        const avg = await db.one(
            `SELECT AVG(overall_stars) as avg_stars, COUNT(*) as cnt FROM ratings WHERE professional_id = $1`,
            [professional_id]
        );
        await db.query(
            `UPDATE professionals SET rating = $1, rating_count = $2 WHERE id = $3`,
            [parseFloat(avg.avg_stars) || 0, parseInt(avg.cnt), professional_id]
        );
    }

    res.json({ rating });
}));

router.get('/professional/:professionalId', wrap(async (req, res) => {
    const { professionalId } = req.params;
    const ratings = await db.many(
        `SELECT r.*, u.name as author_name
         FROM ratings r JOIN users u ON r.author_id = u.id
         WHERE r.professional_id = $1 ORDER BY r.created_at DESC`,
        [professionalId]
    );

    const breakdown = await db.one(
        `SELECT
            AVG(quality_stars) as quality, AVG(delay_stars) as delay,
            AVG(communication_stars) as communication, AVG(price_stars) as price,
            AVG(transparency_stars) as transparency, AVG(overall_stars) as overall,
            COUNT(*) as total
         FROM ratings WHERE professional_id = $1`,
        [professionalId]
    );

    res.json({ ratings, breakdown });
}));

router.get('/:id', wrap(async (req, res) => {
    const rating = await db.one(
        `SELECT r.*, u.name as author_name FROM ratings r JOIN users u ON r.author_id = u.id WHERE r.id = $1`,
        [req.params.id]
    ).catch(() => null);
    if (!rating) throw new HttpError(404, 'Avis introuvable');
    res.json({ rating });
}));

module.exports = router;
