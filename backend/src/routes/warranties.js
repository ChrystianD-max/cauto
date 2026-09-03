const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { audit } = require('../middlewares/audit');
const repairTrace = require('../utils/repairTraceService');

const router = express.Router();
router.use(requireAuth);

router.get('/', wrap(async (req, res) => {
    const { status } = req.query;
    let sql = `
        SELECT w.*, i.vehicle_id, i.professional_id,
               v.make, v.model, v.year, v.plate,
               pu.name as professional_name
        FROM warranties w
        JOIN interventions i ON i.id = w.intervention_id
        JOIN vehicles v ON v.id = i.vehicle_id
        LEFT JOIN professionals p ON p.id = w.professional_id
        LEFT JOIN users pu ON p.user_id = pu.id
        WHERE v.owner_id = $1
    `;
    const params = [req.user.sub];

    if (status === 'active') {
        sql += ' AND w.is_active = true AND w.ends_on >= CURRENT_DATE';
    } else if (status === 'expired') {
        sql += ' AND (w.is_active = false OR w.ends_on < CURRENT_DATE)';
    }

    sql += ' ORDER BY w.starts_on DESC';
    const warranties = await db.many(sql, params);
    res.json({ warranties });
}));

router.get('/vehicle/:vehicleId', wrap(async (req, res) => {
    const { vehicleId } = req.params;
    const warranties = await db.many(
        `SELECT w.*, i.professional_id, pu.name as professional_name
         FROM warranties w
         JOIN interventions i ON i.id = w.intervention_id
         LEFT JOIN professionals p ON p.id = w.professional_id
         LEFT JOIN users pu ON p.user_id = pu.id
         WHERE i.vehicle_id = $1
         ORDER BY w.starts_on DESC`,
        [vehicleId]
    );
    res.json({ warranties });
}));

router.get('/:id', wrap(async (req, res) => {
    let warranty;
    try {
        warranty = await db.one(
            `SELECT w.*, i.vehicle_id, i.professional_id,
                    v.make, v.model, v.year, v.plate, v.mileage,
                    pu.name as professional_name, pu.email as professional_email, pu.phone as professional_phone
             FROM warranties w
             JOIN interventions i ON i.id = w.intervention_id
             JOIN vehicles v ON v.id = i.vehicle_id
             LEFT JOIN professionals p ON p.id = w.professional_id
             LEFT JOIN users pu ON p.user_id = pu.id
             WHERE w.id = $1`,
            [req.params.id]
        );
    } catch (e) {
        throw new HttpError(404, 'Garantie introuvable');
    }
    res.json({ warranty });
}));

router.post('/', wrap(async (req, res) => {
    if (!['GARAGE', 'MECANICIEN', 'ADMIN'].includes(req.user.role)) {
        throw new HttpError(403, 'Acces refuse');
    }

    const { intervention_id, months, conditions, covered_parts, odometer_km } = req.body;
    if (!intervention_id || !months) {
        throw new HttpError(400, 'intervention_id et months sont requis');
    }

    const intervention = await db.one('SELECT * FROM interventions WHERE id = $1', [intervention_id]);
    if (!intervention) throw new HttpError(404, 'Intervention introuvable');

    // Module 73 : une garantie est liée à une réparation RÉELLE, clôturée.
    if (intervention.status !== 'CLOSED') {
        throw new HttpError(409, 'La garantie ne peut être créée que sur une intervention clôturée');
    }

    // Liens obligatoires (Module 73) : repair_order, professional, vehicle.
    const repairOrder = await db.one(
        'SELECT * FROM repair_orders WHERE intervention_id = $1', [intervention_id]
    ).catch(() => null);

    // Vérification du paiement : une garantie est rattachée à une réparation payée.
    const hasPayment = await db.many(
        `SELECT 1 FROM payment_events pe
         JOIN payments p ON p.id = pe.payment_id
         WHERE p.intervention_id = $1 AND pe.status = 'SUCCEEDED' LIMIT 1`,
        [intervention_id]
    ).catch(() => []);
    if (hasPayment.length === 0) {
        throw new HttpError(409, 'La garantie ne peut être créée que sur une réparation payée');
    }

    const warranty = await db.tx(async (c) => {
        const w = await c.one(
            `INSERT INTO warranties (intervention_id, repair_order_id, vehicle_id, professional_id, created_by,
                months, starts_on, ends_on, terms, covered_parts, conditions, odometer_km, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, CURRENT_DATE + ($6 || ' months')::INTERVAL,
                     $7, $8, $9, $10, true)
             ON CONFLICT (intervention_id) DO NOTHING
             RETURNING *`,
            [intervention_id, repairOrder ? repairOrder.id : null, intervention.vehicle_id,
             intervention.professional_id, req.user.sub, months,
             conditions || 'Garantie pieces et main-d\'oeuvre',
             JSON.stringify(covered_parts || []), conditions || null, odometer_km || null]
        );
        if (!w) {
            const existing = await c.one(
                'SELECT * FROM warranties WHERE intervention_id = $1', [intervention_id]
            );
            throw new HttpError(409, 'Une garantie existe déjà pour cette intervention');
        }
        return w;
    });

    // Traçabilité (Module 74) : le journal de réparation est immutable — on
    // ajoute une entrée append-only documentant la création de la garantie.
    await db.query(
        `INSERT INTO repair_trace (intervention_id, vehicle_id, professional_id, actor_id,
            repair_order_id, action, part_label, result, warranty_id, details)
         VALUES ($1, $2, $3, $4, $5, 'WARRANTY_CREATED', NULL, NULL, $6, $7)`,
        [intervention_id, intervention.vehicle_id, intervention.professional_id, req.user.sub,
         warranty.repair_order_id || null, warranty.id,
         JSON.stringify({ months, starts_on: warranty.starts_on, ends_on: warranty.ends_on, odometer_km: warranty.odometer_km })]
    ).catch(() => {});

    // Historique du véhicule (append-only) : création de garantie.
    await db.query(
        `INSERT INTO history_entries (vehicle_id,entry_type,title,details,created_by)
         VALUES ($1,'GARANTIE',$2,$3,$4)`,
        [intervention.vehicle_id, `Garantie ${months} mois créée`,
         JSON.stringify({
            warranty_id: warranty.id, months, covered_parts: warranty.covered_parts,
            starts_on: warranty.starts_on, ends_on: warranty.ends_on, odometer_km: warranty.odometer_km
         }), req.user.sub]
    ).catch(() => {});

    await audit(req, 'warranty.create', 'warranty', warranty.id, {
        intervention_id, months, ends_on: warranty.ends_on, vehicle_id: intervention.vehicle_id
    });

    res.json({ warranty });
}));

module.exports = router;
