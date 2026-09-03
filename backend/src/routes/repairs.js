const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const repairTrace = require('../utils/repairTraceService');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
    const isPro = ['GARAGE', 'MECANICIEN'].includes(req.user.role);
    let sql;
    const params = [];

    if (isPro) {
        params.push(req.user.sub);
        sql = `SELECT i.*, v.make, v.model, v.year, v.plate,
                      (SELECT name FROM users u JOIN professionals pr ON pr.user_id = u.id WHERE pr.id = i.professional_id) as professional_name
               FROM interventions i
               JOIN vehicles v ON v.id = i.vehicle_id
               WHERE i.professional_id IN (SELECT id FROM professionals WHERE user_id = $1)
               ORDER BY i.created_at DESC`;
    } else {
        params.push(req.user.sub);
        sql = `SELECT i.*, v.make, v.model, v.year, v.plate,
                      pu.name as professional_name
               FROM interventions i
               JOIN vehicles v ON v.id = i.vehicle_id
               LEFT JOIN professionals p ON p.id = i.professional_id
               LEFT JOIN users pu ON p.user_id = pu.id
               WHERE v.owner_id = $1
               ORDER BY i.created_at DESC`;
    }

    const repairs = await db.many(sql, params);
    res.json({ repairs });
}));

router.get('/:id', wrap(async (req, res) => {
    let repair;
    try {
        repair = await db.one(
            `SELECT i.*, v.make, v.model, v.year, v.plate, v.mileage, v.owner_id,
                    pu.name as professional_name, pu.email as professional_email, pu.phone as professional_phone,
                    cu.name as client_name, cu.email as client_email
             FROM interventions i
             JOIN vehicles v ON v.id = i.vehicle_id
             LEFT JOIN professionals pr ON pr.id = i.professional_id
             LEFT JOIN users pu ON pr.user_id = pu.id
             LEFT JOIN users cu ON v.owner_id = cu.id
             WHERE i.id = $1`,
            [req.params.id]
        );
    } catch (e) {
        throw new HttpError(404, 'Reparation introuvable');
    }

    const diagnostic = await db.one('SELECT * FROM diagnostics WHERE intervention_id = $1', [repair.id]).catch(() => null);
    const quote = await db.one(
        `SELECT q.*,
                COALESCE((SELECT json_agg(qi.*) FROM quote_items qi WHERE qi.quote_id = q.id), '[]') AS items
         FROM quotes q WHERE q.intervention_id = $1 ORDER BY q.created_at DESC LIMIT 1`,
        [repair.id]
    ).catch(() => null);
    const extraWorks = await db.many('SELECT * FROM extra_work_requests WHERE intervention_id = $1 ORDER BY created_at', [repair.id]).catch(() => []);
    const qualityCheck = await db.one('SELECT * FROM quality_checks WHERE intervention_id = $1', [repair.id]).catch(() => null);

    res.json({ repair: { ...repair, diagnostic, quote, extra_works: extraWorks, quality_check: qualityCheck } });
}));

router.post('/:id/status', wrap(async (req, res) => {
    if (!['GARAGE', 'MECANICIEN', 'ADMIN'].includes(req.user.role)) {
        throw new HttpError(403, 'Acces refuse');
    }

    const { status } = req.body;
    const validStatuses = ['DIAGNOSTIC', 'QUOTE_SENT', 'QUOTE_APPROVED', 'REPAIRING', 'QUALITY_CHECK', 'CLIENT_VALIDATION', 'CLOSED'];
    if (!validStatuses.includes(status)) throw new HttpError(400, 'Statut invalide');

    const order = ['DIAGNOSTIC', 'QUOTE_SENT', 'QUOTE_APPROVED', 'REPAIRING', 'QUALITY_CHECK', 'CLIENT_VALIDATION', 'CLOSED'];
    const repair = await db.one('SELECT * FROM interventions WHERE id = $1', [req.params.id]).catch(() => null);
    if (!repair) throw new HttpError(404, 'Reparation introuvable');
    if (order.indexOf(status) < order.indexOf(repair.status)) {
        throw new HttpError(400, 'Impossible de revenir en arriere dans le workflow');
    }

    const updated = await db.one(
        'UPDATE interventions SET status = $1 WHERE id = $2 RETURNING *',
        [status, req.params.id]
    );

    const srStatusMap = {
        DIAGNOSTIC: 'DIAGNOSIS',
        QUOTE_SENT: 'QUOTE_SENT',
        QUOTE_APPROVED: 'QUOTE_APPROVED',
        REPAIRING: 'REPAIRING',
        QUALITY_CHECK: 'QUALITY_CONTROL',
        CLIENT_VALIDATION: 'QUALITY_CONTROL',
        CLOSED: 'COMPLETED'
    };
    const srStatus = srStatusMap[status];
    if (srStatus) {
        await db.query(
            `UPDATE service_requests SET status=$1, updated_at=NOW()
             WHERE intervention_id=$2`,
            [srStatus, req.params.id]
        ).catch(() => {});
        await db.query(
            `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
             SELECT id, status, $1, $2, $3 FROM service_requests WHERE intervention_id=$4`,
            [srStatus, req.user.sub, `Intervention : ${status}`, req.params.id]
        ).catch(() => {});
    }

    const clientMsg = {
        REPAIRING: 'Les travaux ont commencé sur votre véhicule',
        QUALITY_CHECK: 'Les travaux sont terminés — contrôle qualité en cours. Votre véhicule sera bientôt prêt.',
        CLIENT_VALIDATION: 'Votre véhicule est prêt — veuillez confirmer la bonne réception pour clôturer le dossier.'
    }[status];
    if (clientMsg) {
        await db.query(
            `INSERT INTO notifications (user_id,message,dedupe_key)
             SELECT owner_id, $1, $2 FROM vehicles WHERE id=$3
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [clientMsg, `repair:${req.params.id}:${status.toLowerCase()}`, repair.vehicle_id]
        ).catch(() => {});
    }

    res.json({ repair: updated });
}));

router.get('/:id/timeline', wrap(async (req, res) => {
    const steps = [
        { status: 'VEHICLE_RECEIVED', label: 'Vehicule recu' },
        { status: 'DIAGNOSTIC', label: 'Diagnostic' },
        { status: 'QUOTE_SENT', label: 'Devis envoye' },
        { status: 'QUOTE_APPROVED', label: 'Devis approuve' },
        { status: 'REPAIRING', label: 'Travaux en cours' },
        { status: 'QUALITY_CHECK', label: 'Controle qualite' },
        { status: 'CLIENT_VALIDATION', label: 'Confirmation client' },
        { status: 'CLOSED', label: 'Termine' },
    ];

    let repair;
    try {
        repair = await db.one('SELECT * FROM interventions WHERE id = $1', [req.params.id]);
    } catch (e) {
        throw new HttpError(404, 'Reparation introuvable');
    }

    const order = ['DIAGNOSTIC', 'QUOTE_SENT', 'QUOTE_APPROVED', 'REPAIRING', 'QUALITY_CHECK', 'CLIENT_VALIDATION', 'CLOSED'];
    const currentIdx = order.indexOf(repair.status);

    const timeline = steps.map((s, i) => ({
        ...s,
        done: i <= currentIdx,
        active: i === currentIdx,
    }));

    res.json({ timeline });
}));

router.post('/:id/quality-check', wrap(async (req, res) => {
    if (!['GARAGE', 'MECANICIEN'].includes(req.user.role)) {
        throw new HttpError(403, 'Acces refuse');
    }

    let repair;
    try {
        repair = await db.one('SELECT * FROM interventions WHERE id = $1', [req.params.id]);
    } catch (e) {
        throw new HttpError(404, 'Reparation introuvable');
    }

    const { odometer_km, replaced_parts, measures, photos, codes_before, codes_after, road_test_ok, road_test_notes, result, notes } = req.body;

    const passed = road_test_ok == null ? true : !!road_test_ok;

    const qc = await db.one(
        `INSERT INTO quality_checks (intervention_id, checked_by, odometer_km, replaced_parts, measures, photos, codes_before, codes_after, road_test_ok, road_test_notes, result, notes, passed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (intervention_id) DO UPDATE SET
            checked_by = EXCLUDED.checked_by, odometer_km = EXCLUDED.odometer_km,
            replaced_parts = EXCLUDED.replaced_parts, measures = EXCLUDED.measures,
            photos = EXCLUDED.photos, codes_before = EXCLUDED.codes_before,
            codes_after = EXCLUDED.codes_after, road_test_ok = EXCLUDED.road_test_ok,
            road_test_notes = EXCLUDED.road_test_notes, result = EXCLUDED.result,
            notes = EXCLUDED.notes, passed = EXCLUDED.passed
         RETURNING *`,
        [req.params.id, req.user.sub, odometer_km || null,
         JSON.stringify(replaced_parts || []), JSON.stringify(measures || {}),
         photos || [], codes_before || [], codes_after || [],
         road_test_ok || false, road_test_notes || null, result || 'OK',
         notes || '', passed]
    );

    if (passed && ['REPAIRING', 'QUALITY_CHECK', 'CLIENT_VALIDATION', 'CLOSED'].includes(repair.status)) {
        await db.tx(async (c) => {
            await c.query(`UPDATE interventions SET status='CLIENT_VALIDATION' WHERE id=$1`, [req.params.id]);
            await c.query(
                `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
                 SELECT id, status, 'QUALITY_CONTROL', $1, $2 FROM service_requests WHERE intervention_id=$3
                 ON CONFLICT DO NOTHING`,
                [req.user.sub, 'Contrôle qualité validé — en attente de confirmation de la réception par le client', req.params.id]
            ).catch(() => {});
        });
        await db.query(
            `INSERT INTO notifications (user_id,message,dedupe_key)
             SELECT owner_id, $1, $2 FROM vehicles WHERE id=$3
             ON CONFLICT (dedupe_key) DO NOTHING`,
            ['Les travaux sont terminés et contrôlés — votre véhicule est prêt. Confirmez la bonne réception pour clôturer le dossier.',
             'repair:' + req.params.id + ':client_validation', repair.vehicle_id]
        ).catch(() => {});
    }

    res.json({ quality_check: qc, status: passed ? 'CLIENT_VALIDATION' : repair.status });
}));

// ---- Validation client de la bonne réception du véhicule (clôture)
router.post('/:id/client-confirm', wrap(async (req, res) => {
    if (['GARAGE', 'MECANICIEN'].includes(req.user.role)) {
        throw new HttpError(403, 'Reserve au client');
    }

    let repair;
    try {
        repair = await db.one('SELECT * FROM interventions WHERE id = $1', [req.params.id]);
    } catch (e) {
        throw new HttpError(404, 'Reparation introuvable');
    }

    const owner = await db.one('SELECT owner_id FROM vehicles WHERE id = $1', [repair.vehicle_id]).catch(() => null);
    if (!owner || owner.owner_id !== req.user.sub) {
        throw new HttpError(403, 'Vous n’êtes pas le propriétaire de ce véhicule');
    }
    if (repair.status !== 'CLIENT_VALIDATION') {
        throw new HttpError(409, 'Le véhicule est en attente de confirmation de réception');
    }

    const { received_ok = true, notes } = req.body || {};

    await db.tx(async (c) => {
        await c.query(`UPDATE interventions SET status='CLOSED' WHERE id=$1`, [req.params.id]);
        await c.query(`UPDATE repair_orders SET status='CLOSED' WHERE intervention_id=$1`, [req.params.id]);
        if (repair.appointment_id) {
            await c.query(`UPDATE appointments SET status='DONE' WHERE id=$1`, [repair.appointment_id]);
        }
        await c.query(
            `UPDATE service_requests SET status='COMPLETED', updated_at=NOW() WHERE intervention_id=$1`,
            [req.params.id]
        );
        await c.query(
            `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
             SELECT id, status, 'COMPLETED', $1, $2 FROM service_requests WHERE intervention_id=$3`,
            [req.user.sub, (received_ok ? 'Client a confirmé la bonne réception du véhicule — dossier clôturé' : 'Client a signalé un problème sur la réception du véhicule') + (notes ? ' : ' + String(notes).slice(0, 500) : ''), req.params.id]
        );
        // Module 74 — Traçabilité : journal immutable de la réparation
        // (QUI/QUOI/QUAND/VÉHICULE/KILOMÉTRAGE/PIÈCE/RÉFÉRENCE/PRIX/RÉSULTAT/GARANTIE).
        await repairTrace.traceRepairClosure(c, req.params.id, req.user.sub).catch(() => {});
    });
    await db.query(
        `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
         VALUES ($1,'INTERVENTION','Intervention clôturée après confirmation client',$2,$3)`,
        [repair.vehicle_id, JSON.stringify({ intervention_id: req.params.id, received_ok: !!received_ok }), req.user.sub]
    ).catch(() => {});
    await db.query(
        `INSERT INTO notifications (user_id,message,dedupe_key)
         SELECT u.id, $1, $2 FROM professionals p JOIN users u ON u.id = p.user_id WHERE p.id = $3
         ON CONFLICT (dedupe_key) DO NOTHING`,
        ['Le client a confirmé la bonne réception du véhicule — dossier clôturé', 'repair:' + req.params.id + ':client_confirmed', repair.professional_id]
    ).catch(() => {});

    res.json({ status: 'CLOSED' });
}));

router.get('/:id/quality-check', wrap(async (req, res) => {
    const qc = await db.one('SELECT * FROM quality_checks WHERE intervention_id = $1', [req.params.id]).catch(() => null);
    res.json({ quality_check: qc });
}));

// ---- Module 74 : journal de traçabilité de la réparation (append-only)
router.get('/:id/trace', wrap(async (req, res) => {
    let repair;
    try {
        repair = await db.one('SELECT * FROM interventions WHERE id = $1', [req.params.id]);
    } catch (e) {
        throw new HttpError(404, 'Reparation introuvable');
    }
    const isPro = ['GARAGE', 'MECANICIEN'].includes(req.user.role);
    const owner = await db.one('SELECT owner_id FROM vehicles WHERE id = $1', [repair.vehicle_id]).catch(() => null);
    if (!isPro && (!owner || owner.owner_id !== req.user.sub)) {
        throw new HttpError(403, 'Acces refuse');
    }
    const trace = await db.many(
        `SELECT rt.*, u.name AS actor_name, pu.name AS pro_name
         FROM repair_trace rt
         LEFT JOIN users u ON u.id = rt.actor_id
         LEFT JOIN professionals pr ON pr.id = rt.professional_id
         LEFT JOIN users pu ON pu.id = pr.user_id
         WHERE rt.intervention_id = $1
         ORDER BY rt.occurred_at ASC, rt.created_at ASC`,
        [req.params.id]
    ).catch(() => []);
    res.json({ trace });
}));

module.exports = router;
