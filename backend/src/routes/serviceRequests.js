const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { matchProfessionals } = require('../utils/matchingEngine');
const { validate, z } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const createSrSchema = z.object({
  vehicle_id: z.string().min(1, 'Véhicule requis'),
  problem_description: z.string().min(5, 'Description du problème trop courte'),
  category: z.string().min(2, 'Catégorie requise'),
  urgency: z.string().max(20).optional(),
  preferred_date: z.string().max(40).nullish(),
  photos: z.array(z.string()).max(20).optional(),
  video_url: z.string().max(500).nullable().optional()
}).passthrough();

router.get('/', wrap(async (req, res) => {
    const { status, vehicle_id } = req.query;
    const isPro = ['GARAGE', 'MECANICIEN'].includes(req.user.role);
    
    let sql;
    const params = [];
    
    if (isPro) {
        params.push(req.user.sub);
        sql = `
            SELECT sr.*, v.make, v.model, v.year, v.plate,
                   cu.name as client_name
            FROM service_requests sr
            JOIN vehicles v ON sr.vehicle_id = v.id
            LEFT JOIN users cu ON sr.user_id = cu.id
            WHERE sr.professional_id IN (SELECT id FROM professionals WHERE user_id = $1)
        `;
    } else {
        params.push(req.user.sub);
        sql = `
            SELECT sr.*, v.make, v.model, v.year, v.plate,
                   pu.name as professional_name
            FROM service_requests sr
            JOIN vehicles v ON sr.vehicle_id = v.id
            LEFT JOIN professionals pro ON sr.professional_id = pro.id
            LEFT JOIN users pu ON pro.user_id = pu.id
            WHERE sr.user_id = $1
        `;
    }
    
    if (status) {
        params.push(status);
        sql += ` AND sr.status = $${params.length}`;
    }
    
    if (vehicle_id) {
        params.push(vehicle_id);
        sql += ` AND sr.vehicle_id = $${params.length}`;
    }
    
    sql += ' ORDER BY sr.created_at DESC';
    
    const service_requests = await db.many(sql, params);
    res.json({ service_requests });
}));

router.post('/', validate(createSrSchema), wrap(async (req, res) => {
    const { vehicle_id, problem_description, category, urgency, preferred_date, photos, video_url } = req.body;
    
    const vehicle = await db.one(
        'SELECT * FROM vehicles WHERE id = $1 AND owner_id = $2',
        [vehicle_id, req.user.sub]
    );
    
    if (!vehicle) {
        throw new HttpError(404, 'Vehicule non trouve');
    }
    
    const sr = await db.one(
        `INSERT INTO service_requests (user_id, vehicle_id, problem_description, category, urgency, preferred_date, photos, video_url, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'CREATED')
         RETURNING *`,
        [req.user.sub, vehicle_id, problem_description, category, urgency, preferred_date, photos, video_url]
    );
    
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, NULL, 'CREATED', $2, 'Creation de la demande')`,
        [sr.id, req.user.sub]
    );
    
    res.json({ service_request: sr });
}));

router.get('/:id', wrap(async (req, res) => {
    const isPro = ['GARAGE', 'MECANICIEN'].includes(req.user.role);
    
    let sr;
    if (isPro) {
        sr = await db.one(
            `SELECT sr.*, v.make, v.model, v.year, v.plate, cu.name as client_name
             FROM service_requests sr
             JOIN vehicles v ON sr.vehicle_id = v.id
             LEFT JOIN users cu ON sr.user_id = cu.id
             WHERE sr.id = $1 AND sr.professional_id IN (SELECT id FROM professionals WHERE user_id = $2)`,
            [req.params.id, req.user.sub]
        );
    } else {
        sr = await db.one(
            `SELECT sr.*, v.make, v.model, v.year, v.plate
             FROM service_requests sr
             JOIN vehicles v ON sr.vehicle_id = v.id
             WHERE sr.id = $1 AND sr.user_id = $2`,
            [req.params.id, req.user.sub]
        );
    }
    
    if (!sr) {
        throw new HttpError(404, 'Demande de service non trouvee');
    }
    
    let professional = null;
    if (sr.professional_id) {
        professional = await db.one(
            `SELECT p.*, u.name FROM professionals p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
            [sr.professional_id]
        );
    }
    
    const history = await db.many(
        'SELECT * FROM service_request_history WHERE service_request_id = $1 ORDER BY created_at DESC',
        [sr.id]
    );
    
    const quotes = await db.many(
        'SELECT * FROM quotes WHERE service_request_id = $1',
        [sr.id]
    );
    
    const intervention = await db.one(
        `SELECT i.id, i.status FROM interventions i
         JOIN appointments a ON a.id = i.appointment_id
         WHERE a.vehicle_id = $1
         ORDER BY i.created_at DESC LIMIT 1`,
        [sr.vehicle_id]
    ).catch(() => null);
    
    res.json({ service_request: { ...sr, vehicle: sr, professional, history, quotes, intervention_id: intervention ? intervention.id : null } });
}));

router.put('/:id', wrap(async (req, res) => {
    const sr = await db.one(
        'SELECT * FROM service_requests WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.sub]
    );
    
    if (!sr) {
        throw new HttpError(404, 'Demande de service non trouvee');
    }
    
    if (!['CREATED', 'MATCHING'].includes(sr.status)) {
        throw new HttpError(400, 'Impossible de modifier cette demande');
    }
    
    const { problem_description, category, urgency, preferred_date, photos } = req.body;
    
    const updatedSr = await db.one(
        `UPDATE service_requests 
         SET problem_description = COALESCE($1, problem_description),
             category = COALESCE($2, category),
             urgency = COALESCE($3, urgency),
             preferred_date = COALESCE($4, preferred_date),
             photos = COALESCE($5, photos),
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [problem_description, category, urgency, preferred_date, photos, sr.id]
    );
    
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, $2, $2, $3, 'Mise a jour de la demande')`,
        [sr.id, sr.status, req.user.sub]
    );
    
    res.json({ service_request: updatedSr });
}));

router.post('/:id/cancel', wrap(async (req, res) => {
    const sr = await db.one(
        'SELECT * FROM service_requests WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.sub]
    );
    
    if (!sr) {
        throw new HttpError(404, 'Demande de service non trouvee');
    }
    
    if (!['CREATED', 'MATCHING'].includes(sr.status)) {
        throw new HttpError(400, 'Impossible d\'annuler cette demande');
    }
    
    const { reason } = req.body;
    
    const updatedSr = await db.one(
        `UPDATE service_requests 
         SET status = 'CLOSED',
             cancelled_at = NOW(),
             cancel_reason = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [reason, sr.id]
    );
    
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, $2, 'CLOSED', $3, $4)`,
        [sr.id, sr.status, req.user.sub, reason]
    );
    
    res.json({ service_request: updatedSr });
}));

router.post('/:id/match', wrap(async (req, res) => {
    const sr = await db.one(
        'SELECT * FROM service_requests WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.sub]
    );
    
    if (!sr) {
        throw new HttpError(404, 'Demande de service non trouvee');
    }
    
    const { profile } = req.body;
    const matches = await matchProfessionals(sr.id, profile || 'STANDARD');
    
    const updatedSr = await db.one(
        `UPDATE service_requests 
         SET matched_professionals = $1,
             status = 'MATCHING',
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(matches), sr.id]
    );
    
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, $2, 'MATCHING', $3, 'Lancement du matching')`,
        [sr.id, sr.status, req.user.sub]
    );
    
    res.json({ matches });
}));

router.post('/:id/select', wrap(async (req, res) => {
    const sr = await db.one(
        'SELECT * FROM service_requests WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.sub]
    );
    
    if (!sr) {
        throw new HttpError(404, 'Demande de service non trouvee');
    }
    
    if (sr.status !== 'MATCHING') {
        throw new HttpError(400, 'Impossible de selectionner un professionnel');
    }
    
    const { professional_id } = req.body;
    
    const updatedSr = await db.one(
        `UPDATE service_requests 
         SET professional_id = $1,
             selected_professional_at = NOW(),
             status = 'PROFESSIONAL_SELECTED',
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [professional_id, sr.id]
    );
    
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, $2, 'PROFESSIONAL_SELECTED', $3, 'Selection du professionnel')`,
        [sr.id, sr.status, req.user.sub]
    );
    
    res.json({ service_request: updatedSr });
}));

router.get('/:id/history', wrap(async (req, res) => {
    const sr = await db.one(
        'SELECT id FROM service_requests WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.sub]
    );
    
    if (!sr) {
        throw new HttpError(404, 'Demande de service non trouvee');
    }
    
    const history = await db.many(
        'SELECT * FROM service_request_history WHERE service_request_id = $1 ORDER BY created_at DESC',
        [sr.id]
    );
    
    res.json({ history });
}));

// ---- Pro workflow: accept / refuse a request
async function requireAssignedPro(req) {
    if (!['GARAGE', 'MECANICIEN'].includes(req.user.role)) {
        throw new HttpError(403, 'Acces refuse');
    }
    const prof = await db.one(
        'SELECT id FROM professionals WHERE user_id = $1',
        [req.user.sub]
    ).catch(() => null);
    if (!prof) throw new HttpError(403, 'Profil professionnel introuvable');
    const sr = await db.one(
        'SELECT * FROM service_requests WHERE id = $1',
        [req.params.id]
    ).catch(() => null);
    if (!sr) throw new HttpError(404, 'Demande introuvable');
    if (sr.professional_id !== prof.id) {
        throw new HttpError(403, 'Cette demande ne vous est pas attribuee');
    }
    return { sr, prof };
}

router.post('/:id/accept', wrap(async (req, res) => {
    const { sr, prof } = await requireAssignedPro(req);
    if (sr.status !== 'PROFESSIONAL_SELECTED') {
        throw new HttpError(400, 'Impossible d accepter cette demande');
    }
    const { scheduled_at } = req.body;
    const updated = await db.one(
        `UPDATE service_requests SET status='PRO_ACCEPTED', updated_at=NOW() WHERE id=$1 RETURNING *`,
        [sr.id]
    );
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, 'PROFESSIONAL_SELECTED', 'PRO_ACCEPTED', $2, 'Demande acceptee par le professionnel')`,
        [sr.id, req.user.sub]
    );
    if (scheduled_at) {
        await db.query(
            `INSERT INTO appointments (vehicle_id, professional_id, scheduled_at, status)
             VALUES ($1, $2, $3, 'CONFIRMED') ON CONFLICT DO NOTHING`,
            [sr.vehicle_id, prof.id, new Date(scheduled_at)]
        );
    }
    res.json({ service_request: updated });
}));

router.post('/:id/refuse', wrap(async (req, res) => {
    const { sr } = await requireAssignedPro(req);
    if (sr.status !== 'PROFESSIONAL_SELECTED') {
        throw new HttpError(400, 'Impossible de refuser cette demande');
    }
    const { reason } = req.body;
    const updated = await db.one(
        `UPDATE service_requests SET status='PRO_REFUSED', refuse_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [reason || 'Indisponible', sr.id]
    );
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, 'PROFESSIONAL_SELECTED', 'PRO_REFUSED', $2, $3)`,
        [sr.id, req.user.sub, reason || 'Demande refusee par le pro']
    );
    res.json({ service_request: updated });
}));

// ---- Pro workflow: vehicle reception (VIN + reception form)
router.post('/:id/reception', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
    const { sr } = await requireAssignedPro(req);
    if (!['PRO_ACCEPTED', 'VEHICLE_RECEIVED'].includes(sr.status)) {
        throw new HttpError(400, 'Reception non autorisee a ce stade');
    }
    const { vin, mileage, fuel_level, exterior, interior, observations, keys_provided } = req.body;
    if (vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(String(vin).replace(/\s+/g, ''))) {
        throw new HttpError(400, 'VIN invalide (11 à 17 caractères alphanumériques sans I, O, Q)');
    }
    const updated = await db.one(
        `UPDATE service_requests
         SET reception_vin=$1, reception_mileage=$2, reception_fuel_level=$3,
             reception_exterior=$4, reception_interior=$5, reception_observations=$6,
             reception_keys_provided=$7, reception_submitted_at=NOW(),
             status='VEHICLE_RECEIVED', updated_at=NOW()
         WHERE id=$8 RETURNING *`,
        [vin, mileage, fuel_level, exterior, interior, observations, keys_provided !== false, sr.id]
    );
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, $2, 'VEHICLE_RECEIVED', $3, 'Vehicule receptionne - VIN enregistre, formulaire soumis au client')`,
        [sr.id, sr.status, req.user.sub]
    );
    // Notify client to validate reception
    const client = await db.one('SELECT id FROM users WHERE id=$1', [sr.user_id]).catch(() => null);
    if (client) {
        await db.query(
            `INSERT INTO notifications (user_id,message,dedupe_key)
             VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
            [sr.user_id, 'Votre vehicule a ete receptionne. Validez la reception avant le diagnostic.', `sr:${sr.id}:reception`]
        );
    }
    // Module 61 : le VIN saisi à la réception complète la fiche véhicule du
    // client (celui-ci n'a pas à le renseigner à l'inscription).
    const cleanedVIN = vin && typeof vin === 'string' ? vin.replace(/\s+/g, '').toUpperCase() : null;
    if (cleanedVIN && sr.vehicle_id) {
        await db.query(
            `UPDATE vehicles SET vin = COALESCE(NULLIF(vin, ''), $2) WHERE id = $1 AND (vin IS NULL OR vin = '')`,
            [sr.vehicle_id, cleanedVIN]
        ).catch(() => {});
    }
    res.json({ service_request: updated });
}));

// ---- Client: validate the reception => then pro can diagnose
router.post('/:id/validate-reception', wrap(async (req, res) => {
    const sr = await db.one(
        'SELECT * FROM service_requests WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.sub]
    ).catch(() => null);
    if (!sr) throw new HttpError(404, 'Demande non trouvee');
    if (sr.status !== 'VEHICLE_RECEIVED') {
        throw new HttpError(400, 'En attente de reception du vehicule');
    }
    if (!sr.reception_vin) {
        throw new HttpError(400, 'Aucune reception soumise');
    }
    const updated = await db.one(
        `UPDATE service_requests SET status='RECEPTION_VALIDATED', reception_validated_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [sr.id]
    );
    await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, 'VEHICLE_RECEIVED', 'RECEPTION_VALIDATED', $2, 'Reception validee par le client')`,
        [sr.id, req.user.sub]
    );
    // Notify pro
    await db.query(
        `INSERT INTO notifications (user_id,message,dedupe_key)
         VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
        [req.user.sub, 'Le client a valide la reception. Vous pouvez lancer le diagnostic.', `sr:${sr.id}:validated`]
    );
    res.json({ service_request: updated });
}));

// ---- Pro: launch diagnostics (creates intervention + appointment if needed)
router.post('/:id/start-diagnosis', requireRole('GARAGE', 'MECANICIEN'), wrap(async (req, res) => {
    const { sr, prof } = await requireAssignedPro(req);
    if (sr.status !== 'RECEPTION_VALIDATED') {
        throw new HttpError(400, 'La reception doit etre validee par le client');
    }
    const apt = await db.one(
        `INSERT INTO appointments (vehicle_id, professional_id, scheduled_at, status)
         VALUES ($1, $2, NOW(), 'VEHICLE_RECEIVED') RETURNING *`,
        [sr.vehicle_id, prof.id]
    );
    const intervention = await db.one(
        `INSERT INTO interventions (appointment_id, vehicle_id, professional_id, status)
         VALUES ($1, $2, $3, 'DIAGNOSTIC') RETURNING *`,
        [apt.id, sr.vehicle_id, prof.id]
    );
    const updated = await db.one(
        `UPDATE service_requests SET status='DIAGNOSIS', intervention_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [intervention.id, sr.id]
    );
await db.query(
        `INSERT INTO service_request_history (service_request_id, old_status, new_status, changed_by, notes)
         VALUES ($1, 'RECEPTION_VALIDATED', 'DIAGNOSIS', $2, 'Lancement du diagnostic')`,
        [sr.id, req.user.sub]
    );
    res.json({ service_request: { ...updated, intervention_id: intervention.id }, intervention, appointment: apt });
}));

module.exports = router;
