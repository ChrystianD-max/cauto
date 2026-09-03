const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { validate, z } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const createDisputeSchema = z.object({
  service_request_id: z.string().min(1).optional(),
  intervention_id: z.string().min(1).optional(),
  professional_id: z.string().min(1).optional(),
  subject: z.string().min(3, 'Sujet requis (3 caractères min.)'),
  description: z.string().max(4000).optional(),
  photos: z.array(z.string()).max(20).optional(),
  videos: z.array(z.string()).max(20).optional()
}).passthrough();

router.get('/', wrap(async (req, res) => {
    const { status } = req.query;
    let sql = `SELECT d.*, sr.problem_description, v.make, v.model, v.plate,
                      pu.name as professional_name
               FROM disputes d
               LEFT JOIN service_requests sr ON d.service_request_id = sr.id
               LEFT JOIN vehicles v ON sr.vehicle_id = v.id
               LEFT JOIN professionals p ON d.professional_id = p.id
               LEFT JOIN users pu ON p.user_id = pu.id
               WHERE d.user_id = $1`;
    const params = [req.user.sub];

    if (status) {
        params.push(status);
        sql += ` AND d.status = $${params.length}`;
    }
    sql += ' ORDER BY d.created_at DESC';

    const disputes = await db.many(sql, params);
    res.json({ disputes });
}));

router.post('/', validate(createDisputeSchema), wrap(async (req, res) => {
    if (req.user.role !== 'CLIENT') throw new HttpError(403, 'Seuls les clients peuvent creer un litige');

    const { service_request_id, intervention_id, professional_id, subject, description, quote_data, photos, videos } = req.body;
    if (!subject) throw new HttpError(400, 'Le sujet est requis');

    const dispute = await db.one(
        `INSERT INTO disputes (user_id, service_request_id, intervention_id, professional_id, subject, description, quote_data, photos, videos)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.user.sub, service_request_id || null, intervention_id || null,
         professional_id || null, subject, description || null,
         quote_data ? JSON.stringify(quote_data) : null,
         photos || [], videos || []]
    );

    res.json({ dispute });
}));

router.get('/:id', wrap(async (req, res) => {
    let dispute;
    try {
        dispute = await db.one(
            `SELECT d.*, sr.problem_description, v.make, v.model, v.plate,
                    pu.name as professional_name, su.name as client_name
             FROM disputes d
             LEFT JOIN service_requests sr ON d.service_request_id = sr.id
             LEFT JOIN vehicles v ON sr.vehicle_id = v.id
             LEFT JOIN professionals pr ON d.professional_id = pr.id
             LEFT JOIN users pu ON pr.user_id = pu.id
             JOIN users su ON d.user_id = su.id
             WHERE d.id = $1`,
            [req.params.id]
        );
    } catch (e) {
        throw new HttpError(404, 'Litige introuvable');
    }

    const messages = await db.many(
        `SELECT dm.*, u.name as sender_name FROM dispute_messages dm JOIN users u ON dm.sender_id = u.id WHERE dm.dispute_id = $1 ORDER BY dm.created_at ASC`,
        [dispute.id]
    ).catch(() => []);

    res.json({ dispute: { ...dispute, messages } });
}));

router.get('/:id/messages', wrap(async (req, res) => {
    const messages = await db.many(
        `SELECT dm.*, u.name as sender_name FROM dispute_messages dm JOIN users u ON dm.sender_id = u.id WHERE dm.dispute_id = $1 ORDER BY dm.created_at ASC`,
        [req.params.id]
    ).catch(() => []);
    res.json({ messages });
}));

router.post('/:id/messages', wrap(async (req, res) => {
    const { message, attachment_url, attachment_type } = req.body;
    if (!message) throw new HttpError(400, 'Le message est requis');

    const dm = await db.one(
        `INSERT INTO dispute_messages (dispute_id, sender_id, message, attachment_url, attachment_type)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.params.id, req.user.sub, message, attachment_url || null, attachment_type || null]
    );

    res.json({ message: dm });
}));

router.put('/:id/status', wrap(async (req, res) => {
    const { status, resolution_notes } = req.body;
    const validStatuses = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED', 'CLOSED'];
    if (!validStatuses.includes(status)) throw new HttpError(400, 'Statut invalide');

    const dispute = await db.one('SELECT * FROM disputes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!dispute) throw new HttpError(404, 'Litige introuvable');

    const updated = await db.one(
        `UPDATE disputes SET status = $1, resolution_notes = COALESCE($2, resolution_notes),
         resolved_at = CASE WHEN $1 IN ('RESOLVED', 'CLOSED') THEN NOW() ELSE resolved_at END,
         updated_at = NOW() WHERE id = $3 RETURNING *`,
        [status, resolution_notes || null, dispute.id]
    );

    res.json({ dispute: updated });
}));

module.exports = router;
