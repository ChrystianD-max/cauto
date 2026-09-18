const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { auditChange } = require('../middlewares/audit');
const { services: { quoteAnalysisAI } } = require('../services/ai');

const router = express.Router();
router.use(requireAuth);

async function notify(userId, message, key) {
    await db.query(
        `INSERT INTO notifications (user_id,message,dedupe_key)
         VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
        [userId, message, key]
    ).catch(() => {});
}

async function proUserOf(interventionId) {
    const r = await db.one(
        `SELECT pu.id FROM professionals p
         JOIN users pu ON pu.id = p.user_id
         JOIN interventions i ON i.professional_id = p.id
         WHERE i.id = $1`,
        [interventionId]
    ).catch(() => null);
    return r ? r.id : null;
}

function moneyEur(cents) { return ((cents || 0) / 100).toFixed(2).replace('.', ',') + ' €'; }

router.get('/', wrap(async (req, res) => {
    const { status, intervention_id, service_request_id } = req.query;
    let sql = `
        SELECT q.*,
               v.make, v.model, v.year, v.plate,
               i.vehicle_id,
               u.name as creator_name
        FROM quotes q
        JOIN interventions i ON i.id = q.intervention_id
        JOIN vehicles v ON v.id = i.vehicle_id
        JOIN users u ON q.created_by = u.id
        WHERE (i.vehicle_id IN (SELECT id FROM vehicles WHERE owner_id = $1)
               OR q.created_by = $1)
    `;
    const params = [req.user.sub];

    if (status) {
        params.push(status);
        sql += ` AND q.status = $${params.length}`;
    }
    if (intervention_id) {
        params.push(intervention_id);
        sql += ` AND q.intervention_id = $${params.length}`;
    }
    if (service_request_id) {
        params.push(service_request_id);
        sql += ` AND q.service_request_id = $${params.length}`;
    }

    sql += ' ORDER BY q.created_at DESC';
    const quotes = await db.many(sql, params);
    res.json({ quotes });
}));

router.post('/', wrap(async (req, res) => {
    if (!['GARAGE', 'MECANICIEN', 'ADMIN'].includes(req.user.role)) {
        throw new HttpError(403, 'Acces refuse');
    }

    const { intervention_id, service_request_id, items, delay_days, warranty_months, notes, is_complementary, complementary_message, acompte_percent, acompte_note } = req.body;
    if (!intervention_id) throw new HttpError(400, 'intervention_id requis');

    const existingQuote = await db.one('SELECT id, status FROM quotes WHERE intervention_id = $1', [intervention_id]).catch(() => null);
    if (existingQuote) throw new HttpError(409, 'Un devis existe déjà pour cette intervention (un seul devis par intervention)');

    const total_cents = (items || []).reduce((s, it) => s + (it.qty || 1) * (it.unit_price_cents || 0), 0);
    const perc = acompte_percent == null ? 80 : acompte_percent;
    if (typeof perc !== 'number' || !Number.isFinite(perc) || perc < 0 || perc > 100) throw new HttpError(400, 'Acompte invalide');
    if (acompte_note != null && (typeof acompte_note !== 'string' || acompte_note.length > 2000)) throw new HttpError(400, 'Note d’acompte invalide');
    const acompte_cents = Math.round(total_cents * perc / 100);

    const quote = await db.one(
        `INSERT INTO quotes (intervention_id, service_request_id, total_cents, original_total_cents, created_by, delay_days, warranty_months, notes, status, is_complementary, complementary_message, acompte_percent, acompte_note, acompte_cents)
         VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'PENDING', $8, $9, $10, $11, $12) RETURNING *`,
        [intervention_id, service_request_id || null, total_cents, req.user.sub,
         delay_days || null, warranty_months || null, notes || null, Boolean(is_complementary), complementary_message || null,
         perc, acompte_note || null, acompte_cents]
    );

    for (const it of (items || [])) {
        await db.query(
            `INSERT INTO quote_items (quote_id, label, kind, qty, unit_price_cents) VALUES ($1, $2, $3, $4, $5)`,
            [quote.id, it.label, it.kind || 'OTHER', it.qty || 1, it.unit_price_cents || 0]
        );
    }

    if (quote.is_complementary) {
        await notify(quote.created_by, 'Devis complémentaire créé', `quote:${quote.id}:created`);
        const owner = await db.one(
            `SELECT v.owner_id FROM quotes q JOIN interventions i ON i.id=q.intervention_id JOIN vehicles v ON v.id=i.vehicle_id WHERE q.id=$1`,
            [quote.id]
        ).catch(() => null);
        if (owner) {
            await notify(owner.owner_id,
                quote.complementary_message
                    ? `Devis complémentaire : ${quote.complementary_message}`
                    : 'Un devis complémentaire vous a été transmis — validation requise',
                `quote:${quote.id}:complementary`);
        }
    }

    const quoteItems = await db.many('SELECT * FROM quote_items WHERE quote_id = $1', [quote.id]);
    res.json({ quote: { ...quote, items: quoteItems } });
}));

router.get('/:id', wrap(async (req, res) => {
    let quote;
    try {
        quote = await db.one(
            `SELECT q.*, v.make, v.model, v.year, v.plate, i.vehicle_id,
                    u.name as creator_name
             FROM quotes q
             JOIN interventions i ON i.id = q.intervention_id
             JOIN vehicles v ON v.id = i.vehicle_id
             JOIN users u ON q.created_by = u.id
             WHERE q.id = $1`,
            [req.params.id]
        );
    } catch (e) {
        throw new HttpError(404, 'Devis introuvable');
    }

    const items = await db.many('SELECT * FROM quote_items WHERE quote_id = $1', [req.params.id]).catch(() => []);
    const evidences = await db.many('SELECT * FROM quote_evidences WHERE quote_id = $1', [req.params.id]).catch(() => []);

    // Analyse descriptive (répartition, alertes) — n'approuve ni ne refuse
    // jamais un devis (Module 70 ARCHITECTURE IA).
    const analysis = await quoteAnalysisAI.analyze({ quote, items }).catch(() => null);

    res.json({ quote: { ...quote, items, evidences }, analysis });
}));

router.put('/:id', wrap(async (req, res) => {
    const quote = await db.one('SELECT * FROM quotes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!quote) throw new HttpError(404, 'Devis introuvable');
    if (quote.status !== 'PENDING') throw new HttpError(400, 'Impossible de modifier un devis non en attente');
    if (req.user.sub !== quote.created_by) throw new HttpError(403, 'Seul le créateur peut modifier ce devis');

    const { items, delay_days, warranty_months, notes, is_complementary, complementary_message, acompte_percent, acompte_note } = req.body;
    const total_cents = (items || []).reduce((s, it) => s + (it.qty || 1) * (it.unit_price_cents || 0), 0);
    const perc = acompte_percent != null ? acompte_percent : (quote.acompte_percent == null ? null : Number(quote.acompte_percent));
    if (perc != null && (typeof perc !== 'number' || !Number.isFinite(perc) || perc < 0 || perc > 100)) throw new HttpError(400, 'Acompte invalide');
    if (acompte_note != null && (typeof acompte_note !== 'string' || acompte_note.length > 2000)) throw new HttpError(400, 'Note d’acompte invalide');
    const acompte_cents = perc == null ? null : Math.round(total_cents * perc / 100);

    await db.query('DELETE FROM quote_items WHERE quote_id = $1', [quote.id]);

    const updated = await db.one(
        `UPDATE quotes SET total_cents = $1, delay_days = $2, warranty_months = $3, notes = $4, is_complementary = $5, complementary_message = $6, acompte_percent = $7, acompte_note = $8, acompte_cents = $9 WHERE id = $10 RETURNING *`,
        [total_cents, delay_days || quote.delay_days, warranty_months || quote.warranty_months, notes || quote.notes, is_complementary != null ? Boolean(is_complementary) : quote.is_complementary, complementary_message != null ? complementary_message : quote.complementary_message,
         perc, acompte_note != null ? acompte_note : quote.acompte_note, acompte_cents, quote.id]
    );

    for (const it of (items || [])) {
        await db.query(
            `INSERT INTO quote_items (quote_id, label, kind, qty, unit_price_cents) VALUES ($1, $2, $3, $4, $5)`,
            [updated.id, it.label, it.kind || 'OTHER', it.qty || 1, it.unit_price_cents || 0]
        );
    }

    const quoteItems = await db.many('SELECT * FROM quote_items WHERE quote_id = $1', [updated.id]);
    await auditChange(req, 'quote.update', 'quote', quote.id, { status: quote.status, total_cents: quote.total_cents }, { status: updated.status, total_cents: updated.total_cents }, { items: (items || []).length });
    res.json({ quote: { ...updated, items: quoteItems } });
}));

router.post('/:id/approve', wrap(async (req, res) => {
    const quote = await db.one('SELECT * FROM quotes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!quote) throw new HttpError(404, 'Devis introuvable');
    if (!['PENDING', 'REFUSED'].includes(quote.status)) throw new HttpError(400, 'Devis deja traite');

    const updated = await db.one(
        `UPDATE quotes SET status = 'APPROVED', decided_at = NOW() WHERE id = $1 RETURNING *`,
        [quote.id]
    );

    await db.query(
        `UPDATE service_requests SET status='QUOTE_APPROVED', updated_at=NOW()
         WHERE intervention_id=$1`,
        [quote.intervention_id]
    ).catch(() => {});
    await db.query(
        `UPDATE interventions SET status='QUOTE_APPROVED' WHERE id=$1 AND $2='APPROVED'`,
        [quote.intervention_id, updated.status]
    ).catch(() => {});
    if (quote.service_request_id) {
        await db.query(
            `UPDATE service_requests SET status = 'QUOTE_APPROVED', updated_at = NOW() WHERE id = $1`,
            [quote.service_request_id]
        ).catch(() => {});
    }
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         SELECT id, status, 'QUOTE_APPROVED', $1, 'Devis approuve par le client'
         FROM service_requests WHERE intervention_id=$2`,
        [req.user.sub, quote.intervention_id]
    ).catch(() => {});

    const proUser = await proUserOf(quote.intervention_id);
    if (proUser) {
        await notify(proUser, `Devis approuvé (${moneyEur(updated.total_cents)}) — travaux autorisés`, `quote:${quote.id}:approved`);
    }
    await auditChange(req, 'quote.approve', 'quote', quote.id,
        { status: quote.status, total_cents: quote.total_cents },
        { status: updated.status, decided_at: updated.decided_at },
        { total_cents: updated.total_cents });
    res.json({ quote: updated });
}));

router.post('/:id/refuse', wrap(async (req, res) => {
    const quote = await db.one('SELECT * FROM quotes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!quote) throw new HttpError(404, 'Devis introuvable');
    if (quote.status !== 'PENDING') throw new HttpError(400, 'Devis deja traite');

    const { reason, comment, request_discount } = req.body;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 2) {
        throw new HttpError(400, 'Le motif du refus est requis');
    }

    const updated = await db.one(
        `UPDATE quotes SET status='REFUSED', decided_at=NOW(),
                refusal_reason=$1, refusal_comment=$2, request_discount=$3,
                original_total_cents=COALESCE(original_total_cents,total_cents)
         WHERE id=$4 RETURNING *`,
        [reason.trim(), comment ? comment.trim() : null, Boolean(request_discount), quote.id]
    );

    const proUser = await proUserOf(quote.intervention_id);
    if (proUser) {
        const msg = updated.request_discount
            ? `Votre devis a été refusé (${updated.refusal_reason}). Le client demande une remise.`
            : `Votre devis a été refusé : ${updated.refusal_reason}.`;
        await notify(proUser, msg, `quote:${quote.id}:refused`);
    }
    await auditChange(req, 'quote.refuse', 'quote', quote.id,
        { status: quote.status, total_cents: quote.total_cents },
        { status: updated.status, refusal_reason: updated.refusal_reason, request_discount: updated.request_discount },
        { service_request_id: quote.service_request_id });
    res.json({ quote: updated });
}));

// ---- The client requests a discount (remise) AFTER refusing the quote
router.post('/:id/request-remise', wrap(async (req, res) => {
    const quote = await db.one('SELECT * FROM quotes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!quote) throw new HttpError(404, 'Devis introuvable');
    if (quote.status !== 'REFUSED') throw new HttpError(409, 'Le devis n’est pas refusé');
    if (quote.discount_granted != null) throw new HttpError(409, 'Remise déjà traitée');
    if (quote.request_discount) throw new HttpError(409, 'Une demande de remise est déjà en cours');

    const updated = await db.one(
        `UPDATE quotes SET request_discount=true WHERE id=$1 RETURNING *`,
        [quote.id]
    );
    const proUser = await proUserOf(quote.intervention_id);
    if (proUser) {
        await notify(proUser,
            `Le client souhaite une remise sur le devis refusé (${updated.refusal_reason || 'devis refusé'}).`,
            `quote:${quote.id}:remise-requested`);
    }
    await auditChange(req, 'quote.request_remise', 'quote', quote.id,
        { request_discount: false }, { request_discount: true },
        { service_request_id: quote.service_request_id });
    res.json({ quote: updated });
}));

// ---- Pro decision on the client's discount request (remise)
router.post('/:id/remise', wrap(async (req, res) => {
    if (!['GARAGE', 'MECANICIEN', 'ADMIN'].includes(req.user.role)) {
        throw new HttpError(403, 'Acces refuse');
    }
    const quote = await db.one('SELECT * FROM quotes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!quote) throw new HttpError(404, 'Devis introuvable');
    if (quote.status !== 'REFUSED') throw new HttpError(409, 'Aucun refus à traiter');
    if (quote.discount_granted != null) throw new HttpError(409, 'Remise déjà traitée');
    if (!quote.request_discount) throw new HttpError(409, 'Le client n’a pas demandé de remise');
    if (req.user.sub !== quote.created_by) throw new HttpError(403, 'Seul le professionnel auteur du devis peut répondre');

    const { grant, discount_percent, discount_cents, comment } = req.body;

    if (grant) {
        const original = quote.original_total_cents || quote.total_cents;
        let amount = 0;
        if (discount_cents != null && Number(discount_cents) > 0) {
            amount = Math.round(Number(discount_cents));
        } else if (discount_percent != null && Number(discount_percent) > 0 && Number(discount_percent) <= 100) {
            amount = Math.round(original * Number(discount_percent) / 100);
        } else {
            throw new HttpError(400, 'Précisez un pourcentage ou un montant de remise');
        }
        if (amount >= original) throw new HttpError(400, 'La remise ne peut pas dépasser le montant du devis');
        const newTotal = original - amount;

        const updated = await db.one(
            `UPDATE quotes SET status='PENDING', decided_at=NULL,
                    discount_granted=true, discount_percent=$1, discount_cents=$2,
                    pro_comment=$3, total_cents=$4,
                    acompte_cents=CASE WHEN acompte_percent IS NULL THEN NULL ELSE round($4::integer::numeric * acompte_percent / 100)::integer END
             WHERE id=$5 RETURNING *`,
            [discount_percent != null ? Number(discount_percent) : (discount_cents != null ? Math.round(amount * 100 / original) : null),
             amount, comment ? comment.trim() : null, newTotal, quote.id]
        );

        const owner = await db.one(
            `SELECT v.owner_id FROM quotes q JOIN interventions i ON i.id=q.intervention_id JOIN vehicles v ON v.id=i.vehicle_id WHERE q.id=$1`,
            [quote.id]
        ).catch(() => null);
        if (owner) {
            await notify(owner.owner_id,
                `Le professionnel vous accorde une remise de ${moneyEur(amount)} — nouveau total ${moneyEur(newTotal)}, à approuver`,
                `quote:${quote.id}:remise-granted`);
        }
        await auditChange(req, 'quote.remise', 'quote', quote.id,
            { status: quote.status, total_cents: quote.total_cents, discount_granted: quote.discount_granted },
            { status: updated.status, total_cents: updated.total_cents, discount_percent: updated.discount_percent, discount_granted: updated.discount_granted },
            { amount_cents: amount });
        res.json({ quote: updated });
    } else {
        const updated = await db.one(
            `UPDATE quotes SET discount_granted=false, pro_comment=$1 WHERE id=$2 RETURNING *`,
            [comment ? comment.trim() : 'Prix maintenu', quote.id]
        );
        const owner = await db.one(
            `SELECT v.owner_id FROM quotes q JOIN interventions i ON i.id=q.intervention_id JOIN vehicles v ON v.id=i.vehicle_id WHERE q.id=$1`,
            [quote.id]
        ).catch(() => null);
        if (owner) {
            await notify(owner.owner_id,
                updated.pro_comment === 'Prix maintenu'
                    ? 'Le professionnel a maintenu le prix du devis. Le devis reste disponible si vous changez d’avis.'
                    : `Le professionnel a refusé la remise : ${updated.pro_comment}`,
                `quote:${quote.id}:remise-refused`);
        }
        await auditChange(req, 'quote.remise', 'quote', quote.id,
            { status: quote.status, total_cents: quote.total_cents, discount_granted: quote.discount_granted },
            { status: updated.status, total_cents: updated.total_cents, discount_granted: updated.discount_granted, pro_comment: updated.pro_comment },
            { granted: false });
        res.json({ quote: updated });
    }
}));

router.post('/:id/evidences', wrap(async (req, res) => {
    const quote = await db.one('SELECT * FROM quotes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!quote) throw new HttpError(404, 'Devis introuvable');

    const { kind, url, label } = req.body;
    const evidence = await db.one(
        `INSERT INTO quote_evidences (quote_id, kind, url, label) VALUES ($1, $2, $3, $4) RETURNING *`,
        [quote.id, kind || 'PHOTO', url, label || null]
    );
    res.json({ evidence });
}));

// ---- Réédition d'un devis REFUSÉ par le professionnel (diagnostic ré-émis).
//      Contexte (blocage réel signalé) : après un refus du client SANS demande
//      de remise, la procédure s'arrêtait — plus aucun moyen pour le pro de
//      ré-établir un devis de diagnostic. Cette route rouvre le devis en
//      PENDING (un seul devis par intervention : même ligne, statut réouvert),
//      incrémente reissue_count (audit traçable) et pose une note pro standard
//      adressée au client (prise d'acte + compréhension + à disposition).
router.post('/:id/reissue', wrap(async (req, res) => {
    if (req.user.role !== 'PRO') throw new HttpError(403, 'Réservé au professionnel');

    const quote = await db.one('SELECT * FROM quotes WHERE id = $1', [req.params.id]).catch(() => null);
    if (!quote) throw new HttpError(404, 'Devis introuvable');
    if (quote.status !== 'REFUSED') throw new HttpError(409, 'Seul un devis refusé peut être ré-émis');
    if (quote.created_by !== req.user.sub) throw new HttpError(403, "Seul l'auteur du devis peut le ré-émettre");
    if (quote.is_complementary) throw new HttpError(409, 'Un devis complémentaire ne se ré-édite pas ici');

    const { items, delay_days, warranty_months, notes, acompte_percent, acompte_note } = req.body || {};
    const total_cents = (items || []).reduce((s, it) => s + (it.qty || 1) * (it.unit_price_cents || 0), 0);
    if (!(total_cents > 0)) throw new HttpError(400, 'Le devis ré-émis doit contenir au moins un article');

    const perc = acompte_percent == null ? 80 : acompte_percent;
    if (typeof perc !== 'number' || !Number.isFinite(perc) || perc < 0 || perc > 100) throw new HttpError(400, 'Acompte invalide');
    const acompte_cents = Math.round(total_cents * perc / 100);

    const note = (notes && String(notes).trim())
        ? String(notes).trim()
        : `Nous prenons acte de votre décision et comprenons votre refus. Pour le diagnostic, nous vous proposons un nouveau devis ajusté — restons à votre disposition pour toute précision.`;

    const updated = await db.one(
        `UPDATE quotes SET status='PENDING', decided_at=NULL, refusal_reason=NULL,
           refusal_comment=NULL, request_discount=false, discount_granted=false,
           reissue_count = reissue_count + 1, last_pro_note = $1,
           notes = $2, delay_days = COALESCE($3, delay_days),
           warranty_months = COALESCE($4, warranty_months),
           acompte_percent = $5, acompte_note = $6, acompte_cents = $7,
           total_cents = $8, original_total_cents = $8
         WHERE id = $9 RETURNING *`,
        [note, notes ? String(notes).trim() : quote.notes, delay_days || null,
         warranty_months || null, perc, acompte_note || null, acompte_cents,
         total_cents, quote.id]
    );

    await db.query('DELETE FROM quote_items WHERE quote_id = $1', [quote.id]).catch(() => {});
    for (const it of (items || [])) {
        await db.query(
            `INSERT INTO quote_items (quote_id, label, kind, qty, unit_price_cents) VALUES ($1, $2, $3, $4, $5)`,
            [quote.id, it.label, it.kind || 'OTHER', it.qty || 1, it.unit_price_cents || 0]
        ).catch(() => {});
    }

    const owner = await db.one(
        `SELECT v.owner_id FROM quotes q JOIN interventions i ON i.id=q.intervention_id JOIN vehicles v ON v.id=i.vehicle_id WHERE q.id=$1`,
        [quote.id]
    ).catch(() => null);
    if (owner) {
        await notify(owner.owner_id, `Votre professionnel a établi un nouveau devis de diagnostic (réédition) : ${moneyEur(updated.total_cents)}`, `quote:${quote.id}:reissue`).catch(() => {});
    }
    await auditChange(req, 'quote.reissue', 'quote', quote.id,
        { status: quote.status, reissue_count: quote.reissue_count, total_cents: quote.total_cents },
        { status: updated.status, reissue_count: updated.reissue_count, total_cents: updated.total_cents, last_pro_note: updated.last_pro_note },
        { approved: false, reissued: true });

    const quoteItems = await db.many('SELECT * FROM quote_items WHERE quote_id = $1', [quote.id]).catch(() => []);
    res.json({ quote: { ...updated, items: quoteItems } });
}));

module.exports = router;