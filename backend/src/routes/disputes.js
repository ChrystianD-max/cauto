const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { auditChange } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');
const { validate, z } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

async function notify(userId, message, key) {
    await db.query(
        `INSERT INTO notifications (user_id,message,dedupe_key)
         VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
        [userId, message, key]
    ).catch(() => {});
}

const createDisputeSchema = z.object({
  service_request_id: z.string().min(1).optional(),
  intervention_id: z.string().min(1).optional(),
  professional_id: z.string().min(1).optional(),
  subject: z.string().min(3, 'Sujet requis (3 caractères min.)'),
  description: z.string().max(4000).optional(),
  photos: z.array(z.string()).max(20).optional(),
  videos: z.array(z.string()).max(20).optional()
}).passthrough();

const resolveDisputeSchema = z.object({
  resolution_kind: z.enum(['REPAIR', 'COMPENSATION']),
  compensation_cents: z.number().int().min(0).optional(),
  pro_resolution_notes: z.string().max(4000).optional()
}).passthrough();

const confirmDisputeSchema = z.object({
  notes: z.string().max(2000).optional()
}).passthrough();

const escalateDisputeSchema = z.object({
  reason: z.string().min(3, 'Motif requis (3 caractères min.)').max(4000)
}).passthrough();

const adminResolveDisputeSchema = z.object({
  admin_resolution_notes: z.string().min(3, 'Notes de résolution requises').max(4000),
  resolution_kind: z.enum(['REPAIR', 'COMPENSATION']).optional(),
  compensation_cents: z.number().int().min(0).optional()
}).passthrough();

async function proProfessionalId(userId) {
    const r = await db.one('SELECT id FROM professionals WHERE user_id = $1', [userId]).catch(() => null);
    return r ? r.id : null;
}

async function disputeParts(dispute) {
    const part = await db.one(
        `SELECT v.owner_id as client_user_id, pu.name as professional_name
         FROM disputes d
         LEFT JOIN service_requests sr ON d.service_request_id = sr.id
         LEFT JOIN vehicles v ON sr.vehicle_id = v.id
         LEFT JOIN professionals p ON d.professional_id = p.id
         LEFT JOIN users pu ON p.user_id = pu.id
         WHERE d.id = $1`,
        [dispute.id]
    ).catch(() => ({ client_user_id: null, professional_name: null }));
    return part;
}

router.get('/', wrap(async (req, res) => {
    const { status, escalated } = req.query;
    const role = req.user.role;
    const params = [];

    let sql = `SELECT d.*, sr.problem_description, v.make, v.model, v.plate,
                      pu.name as professional_name
               FROM disputes d
               LEFT JOIN service_requests sr ON d.service_request_id = sr.id
               LEFT JOIN vehicles v ON sr.vehicle_id = v.id
               LEFT JOIN professionals p ON d.professional_id = p.id
               LEFT JOIN users pu ON p.user_id = pu.id
               WHERE 1=1`;

    if (req.user.role === 'CLIENT') {
        params.push(req.user.sub);
        sql += ` AND d.user_id = $${params.length}`;
    } else if (['GARAGE', 'MECANICIEN'].includes(role)) {
        const proId = await proProfessionalId(req.user.sub);
        if (!proId) throw new HttpError(403, 'Aucun profil professionnel associé à ce compte');
        params.push(proId);
        sql += ` AND d.professional_id = $${params.length}`;
    }
    // ADMIN : voit tout (avec ou sans le flag escalated)

    if (status) {
        params.push(status);
        sql += ` AND d.status = $${params.length}`;
    }
    if (escalated === 'true' || escalated === true) {
        sql += ` AND d.escalated_at IS NOT NULL AND d.admin_resolved_at IS NULL`;
    }
    sql += ' ORDER BY d.created_at DESC';

    const disputes = await db.many(sql, params);
    res.json({ disputes });
}));

// ---- Résolution proposée par le professionnel (REPAIR | COMPENSATION).
//      * COMPENSATION : plafonnée au solde restant (total_cents - acompte)
//      * POSE la proposition + bascule litige en 'IN_REVIEW' + notifie le client
//        qui doit la confirmer (et le pro confirmera de son côté).
router.post('/:id/pro-resolve', validate(resolveDisputeSchema), wrap(async (req, res) => {
    if (!['GARAGE', 'MECANICIEN', 'ADMIN'].includes(req.user.role)) {
        throw new HttpError(403, 'Réservé au professionnel');
    }
    const dispute = await db.one('SELECT * FROM disputes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!dispute) throw new HttpError(404, 'Litige introuvable');

    const proId = await proProfessionalId(req.user.sub);
    if (!proId && req.user.role !== 'ADMIN') throw new HttpError(403, 'Profil professionnel introuvable');
    if (dispute.professional_id && proId && dispute.professional_id !== proId && req.user.role !== 'ADMIN') {
        throw new HttpError(403, 'Ce litige concerne un autre professionnel');
    }
    if (['RESOLVED', 'CLOSED', 'ESCALATED'].includes(dispute.status)) {
        throw new HttpError(409, 'Litige déjà traité');
    }

    const { resolution_kind, compensation_cents, pro_resolution_notes } = req.body;

    let comp = compensation_cents;
    if (resolution_kind === 'COMPENSATION') {
        const balance = (dispute.quote_data && dispute.quote_data.total_cents || 0)
            - (dispute.quote_data && dispute.quote_data.acompte_cents || 0);
        // solde = total - acompte (les 20 % restants / 25 % selon acompte)
        comp = comp == null ? balance : Math.min(comp, balance);
        if (!(comp > 0)) {
            throw new HttpError(409, 'Aucun solde restant à compenser (total = acompte)');
        }
    } else {
        comp = null;
    }

    const updated = await db.one(
        `UPDATE disputes SET resolution_kind = $1, compensation_cents = $2,
                pro_resolution_notes = $3, pro_decided_at = NOW(), status = 'IN_REVIEW'
             WHERE id = $4 RETURNING *`,
        [resolution_kind, comp, pro_resolution_notes || null, dispute.id]
    );

    await notify(dispute.user_id,
        `Le professionnel propose une ${resolution_kind === 'REPAIR' ? 'réparation du désordre' : 'compensation de ' + (comp / 100).toFixed(2).replace('.', ',') + ' €'}. Merci de confirmer pour clore le litige.`,
        `dispute:${dispute.id}:pro-resolved`);
    await auditChange(req, 'dispute.pro_resolve', 'dispute', dispute.id,
        { status: dispute.status, resolution_kind: dispute.resolution_kind },
        { status: updated.status, resolution_kind: updated.resolution_kind, compensation_cents: updated.compensation_cents });
    res.json({ dispute: updated });
}));

// ---- Confirmation par le client OU le pro (chacun son tour). Quand les DEUX
//      ont confirmé (client_confirmed_at + pro_confirmed_at), le litige est
//      clôturé (RESOLVED).
router.post('/:id/confirm', validate(confirmDisputeSchema), wrap(async (req, res) => {
    const dispute = await db.one('SELECT * FROM disputes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!dispute) throw new HttpError(404, 'Litige introuvable');
    if (!['IN_REVIEW'].includes(dispute.status)) throw new HttpError(409, 'Aucune résolution à confirmer');
    if (!dispute.pro_decided_at) throw new HttpError(409, 'Le professionnel n’a pas encore proposé de résolution');

    const isClient = req.user.role === 'CLIENT';
    const proId = await proProfessionalId(req.user.sub);
    const isPro = !!proId;

    if (isClient && dispute.user_id !== req.user.sub) throw new HttpError(403, 'Ce litige ne vous concerne pas');
    if (isPro && proId && dispute.professional_id !== proId) throw new HttpError(403, 'Ce litige concerne un autre professionnel');
    if (!isClient && !isPro) throw new HttpError(403, 'Confirmation réservée au client et au professionnel concernés');

    const col = isClient ? 'client_confirmed_at' : 'pro_confirmed_at';
    const updated = await db.one(
        `UPDATE disputes SET ${col} = NOW(), status = CASE
             WHEN client_confirmed_at IS NOT NULL AND pro_confirmed_at IS NOT NULL THEN 'RESOLVED'
             ELSE 'IN_REVIEW' END,
             updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [dispute.id]
    );

    if (updated.status === 'RESOLVED') {
        await db.query(
            `UPDATE disputes SET resolved_at = NOW() WHERE id = $1`,
            [dispute.id]
        );
        await notify(dispute.user_id, 'Litige résolu — les deux parties ont confirmé la résolution.', `dispute:${dispute.id}:resolved`).catch(() => {});
        const part = await disputeParts(dispute);
        if (part.client_user_id && part.client_user_id !== dispute.user_id) {
            await notify(part.client_user_id, 'Litige résolu — confirmation des deux côtés.', `dispute:${dispute.id}:resolved-2`).catch(() => {});
        }
    }
    if (isPro && updated.status !== 'RESOLVED') {
        await notify(dispute.user_id, 'Le professionnel a confirmé la résolution — il vous reste à confirmer.', `dispute:${dispute.id}:pro-confirmed`).catch(() => {});
    }
    await auditChange(req, 'dispute.confirm', 'dispute', dispute.id,
        { status: dispute.status, [col]: dispute.client_confirmed_at || dispute.pro_confirmed_at },
        { status: updated.status, [col]: updated[col] });
    res.json({ dispute: updated });
}));

// ---- Escalade admin : notification IMMÉDIATE à tous les admins + prise en
//      charge / suivi par un admin (détail + résolution admin).
router.post('/:id/escalate', validate(escalateDisputeSchema), wrap(async (req, res) => {
    const dispute = await db.one('SELECT * FROM disputes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!dispute) throw new HttpError(404, 'Litige introuvable');
    const role = req.user.role;

    const isClient = role === 'CLIENT' && dispute.user_id === req.user.sub;
    const proId = await proProfessionalId(req.user.sub);
    const isPro = !!proId && dispute.professional_id === proId;
    const isAdmin = role === 'ADMIN';
    if (!isClient && !isPro && !isAdmin) throw new HttpError(403, 'Accès refusé à ce litige');
    if (['RESOLVED', 'CLOSED'].includes(dispute.status)) throw new HttpError(409, 'Litige déjà clôturé');

    const { reason } = req.body;
    const updated = await db.one(
        `UPDATE disputes SET status = 'ESCALATED', escalated_at = NOW(), escalated_by = $1
         WHERE id = $2 RETURNING *`,
        [req.user.sub, dispute.id]
    );

    // Notification immédiate à tous les admins
    await db.query(
        `INSERT INTO notifications (user_id, message, dedupe_key)
         SELECT u.id, $1, $2 FROM users u
         WHERE u.role = 'ADMIN'
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [`Litige escaladé (${reason.slice(0, 200)}) — intervention requise.`, `dispute:${dispute.id}:escalated`]
    ).catch(() => {});
    await auditChange(req, 'dispute.escalate', 'dispute', dispute.id,
        { status: dispute.status }, { status: 'ESCALATED', escalated_by: req.user.sub, reason });
    res.json({ dispute: { ...updated, escalated: true } });
}));

// ---- Résolution par l'admin (après escalade)
router.post('/:id/admin-resolve', validate(adminResolveDisputeSchema), wrap(async (req, res) => {
    if (req.user.role !== 'ADMIN') throw new HttpError(403, 'Réservé à l’administrateur');
    const dispute = await db.one('SELECT * FROM disputes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!dispute) throw new HttpError(404, 'Litige introuvable');

    const { admin_resolution_notes, resolution_kind, compensation_cents } = req.body;
    let comp = compensation_cents;
    if (resolution_kind === 'COMPENSATION') {
        const balance = (dispute.quote_data && dispute.quote_data.total_cents || 0)
            - (dispute.quote_data && dispute.quote_data.acompte_cents || 0);
        comp = comp == null ? balance : Math.min(comp, balance);
    } else comp = null;

    const updated = await db.one(
        `UPDATE disputes SET status = 'RESOLVED', resolved_at = NOW(),
                resolution_kind = COALESCE($1, resolution_kind),
                compensation_cents = COALESCE($2, compensation_cents),
                admin_resolution_notes = $3, admin_resolved_at = NOW()
         WHERE id = $4 RETURNING *`,
        [resolution_kind || null, comp, admin_resolution_notes, dispute.id]
    );

    await notify(dispute.user_id, `L’administration a résolu votre litige : ${admin_resolution_notes.slice(0, 200)}`, `dispute:${dispute.id}:admin-resolved`).catch(() => {});
    const pro = await db.one(`SELECT professional_id FROM disputes WHERE id = $1`, [dispute.id]).catch(() => null);
    const proUser = pro && pro.professional_id
        ? await db.one(
            `SELECT pu.id FROM professionals p JOIN users pu ON pu.id = p.user_id WHERE p.id = $1`,
            [pro.professional_id]
        ).catch(() => null)
        : null;
    if (proUser) {
        await notify(proUser.id, `L’administration a résolu le litige : ${admin_resolution_notes.slice(0, 200)}`, `dispute:${dispute.id}:admin-resolved-pro`).catch(() => {});
    }
    await auditChange(req, 'dispute.admin_resolve', 'dispute', dispute.id,
        { status: dispute.status }, { status: 'RESOLVED', admin_resolution_notes, resolution_kind: updated.resolution_kind });
    res.json({ dispute: updated });
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
