const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
    const { status } = req.query;
    let sql = `SELECT so.*, v.make, v.model, v.year, v.plate
               FROM second_opinions so
               JOIN vehicles v ON so.vehicle_id = v.id
               WHERE so.user_id = $1`;
    const params = [req.user.sub];

    if (status) {
        params.push(status);
        sql += ` AND so.status = $${params.length}`;
    }
    sql += ' ORDER BY so.created_at DESC';

    const second_opinions = await db.many(sql, params);
    res.json({ second_opinions });
}));

router.post('/', wrap(async (req, res) => {
    const { service_request_id, vehicle_id, diagnostic, first_quote_data, photos, videos, dtc_codes, symptoms } = req.body;
    if (!vehicle_id) throw new HttpError(400, 'vehicle_id requis');

    const so = await db.one(
        `INSERT INTO second_opinions (user_id, service_request_id, vehicle_id, diagnostic,
            first_quote_data, photos, videos, dtc_codes, symptoms, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING') RETURNING *`,
        [req.user.sub, service_request_id || null, vehicle_id,
         diagnostic || null, first_quote_data ? JSON.stringify(first_quote_data) : null,
         photos || [], videos || [], dtc_codes || [], symptoms || null]
    );

    res.json({ second_opinion: so });
}));

router.get('/:id', wrap(async (req, res) => {
    let so;
    try {
        so = await db.one(
            `SELECT so.*, v.make, v.model, v.year, v.plate, v.mileage
             FROM second_opinions so
             JOIN vehicles v ON so.vehicle_id = v.id
             WHERE so.id = $1`,
            [req.params.id]
        );
    } catch (e) {
        throw new HttpError(404, 'Deuxieme avis introuvable');
    }
    res.json({ second_opinion: so });
}));

router.post('/:id/respond', wrap(async (req, res) => {
    if (!['GARAGE', 'MECANICIEN', 'ADMIN'].includes(req.user.role)) {
        throw new HttpError(403, 'Acces refuse');
    }

    const { second_opinion_data, agreement_points, divergence_points, recommendations } = req.body;

    const so = await db.one(
        `UPDATE second_opinions
         SET status = 'COMPLETED',
             second_opinion_data = $1,
             agreement_points = $2,
             divergence_points = $3,
             recommendations = $4,
             updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [JSON.stringify(second_opinion_data || {}),
         JSON.stringify(agreement_points || []),
         JSON.stringify(divergence_points || []),
         JSON.stringify(recommendations || []),
         req.params.id]
    ).catch(() => null);

    if (!so) throw new HttpError(404, 'Deuxieme avis introuvable');
    res.json({ second_opinion: so });
}));

module.exports = router;
