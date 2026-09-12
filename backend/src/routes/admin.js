const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth, requireRole, requirePermission } = require('../middlewares/auth');
const { audit, auditChange } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');
const NotificationService = require('../services/notifications/NotificationService');

const ROLES = ['CLIENT', 'GARAGE', 'MECANICIEN', 'EXPERT', 'SUPPLIER', 'LIVREUR', 'FLEET_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const ORDER_STATUS = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PROG_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

const router = express.Router();
router.use(requireAuth);

/* ============ Notifications personnelles (utilisateur connecté, hors admin) ============ */
router.get('/notifications', wrap(async (req, res) => {
  const [rows, unread] = await Promise.all([
    db.many(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.sub]
    ),
    db.one('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1 AND seen_at IS NULL', [req.user.sub])
  ]);
  res.json({ notifications: rows, unread_count: unread.n });
}));

router.get('/notifications/unread-count', wrap(async (req, res) => {
  const unread = await db.one('SELECT COUNT(*)::int AS n FROM notifications WHERE user_id=$1 AND seen_at IS NULL', [req.user.sub]);
  res.json({ unread_count: unread.n });
}));

router.patch('/notifications/:id/read', wrap(async (req, res) => {
  await db.query('UPDATE notifications SET seen_at=NOW() WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]);
  res.json({ message: 'Notification marquee comme lue' });
}));

router.patch('/notifications/read-all', wrap(async (req, res) => {
  await db.query('UPDATE notifications SET seen_at=NOW() WHERE user_id=$1 AND seen_at IS NULL', [req.user.sub]);
  res.json({ message: 'Notifications marquees comme lues' });
}));

router.delete('/notifications/read-all', wrap(async (req, res) => {
  await db.query('DELETE FROM notifications WHERE user_id=$1', [req.user.sub]);
  res.json({ message: 'Toutes les notifications supprimées' });
}));

/* ============ Zone réservée ADMIN ============ */
router.use(requireRole('ADMIN'));

router.get('/dashboard', wrap(async (req, res) => {
  const [users, vehicles, pro, suppliers, sr, appts, intvs, diags, quotes, watts, py, po, disputes, reviews, progs, faults, notifs, pendV, recents, auditLogs] = await Promise.all([
    db.one(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE role='CLIENT')::int AS clients,
      COUNT(*) FILTER (WHERE role='GARAGE')::int AS garages,
      COUNT(*) FILTER (WHERE role='MECANICIEN')::int AS technicians,
      COUNT(*) FILTER (WHERE role='SUPPLIER')::int AS suppliers,
      COUNT(*) FILTER (WHERE role='ADMIN')::int AS admins,
      COUNT(*) FILTER (WHERE status='SUSPENDED')::int AS suspended FROM users`),
    db.one('SELECT COUNT(*)::int AS total FROM vehicles'),
    db.one(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE verification_status='VERIFIED')::int AS verified,
      COUNT(*) FILTER (WHERE verification_status='UNVERIFIED')::int AS unverified,
      COUNT(*) FILTER (WHERE is_certified)::int AS certified,
      COUNT(*) FILTER (WHERE NOT is_certified)::int AS not_certified FROM professionals`),
    db.one('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE verified)::int AS verified, COUNT(*) FILTER (WHERE NOT verified)::int AS unverified FROM suppliers'),
    db.one('SELECT COUNT(*)::int AS total FROM service_requests'),
    db.one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='REQUESTED')::int AS requested FROM appointments`),
    db.one('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status=\'CLOSED\')::int AS closed, COUNT(*) FILTER (WHERE status=\'REPAIRING\')::int AS repairing FROM interventions'),
    db.one(`SELECT (SELECT COUNT(*) FROM diagnostics)::int AS diagnostics, (SELECT COUNT(*) FROM diagnostic_sessions)::int AS sessions`),
    db.one(`SELECT COUNT(*)::int AS total, COALESCE(SUM(total_cents) FILTER (WHERE status='APPROVED'),0)::bigint AS approved_cents FROM quotes`),
    db.one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active AND ends_on > CURRENT_DATE)::int AS active FROM warranties`),
    db.one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='SUCCEEDED')::int AS succeeded, COALESCE(SUM(amount_cents) FILTER (WHERE status='SUCCEEDED'),0)::bigint AS revenue_cents FROM payments`),
    db.one(`SELECT COUNT(*)::int AS total, COALESCE(SUM(total_cents) FILTER (WHERE status IN ('CONFIRMED','SHIPPED','DELIVERED')),0)::bigint AS revenue_cents FROM part_orders`),
    db.one('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN (\'OPEN\',\'IN_REVIEW\',\'ESCALATED\'))::int AS open FROM disputes'),
    db.one('SELECT COUNT(*)::int AS total, COALESCE(AVG(overall_stars),0)::numeric(3,2) AS avg FROM ratings'),
    db.one('SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE admin_status=\'DRAFT\')::int AS draft, COUNT(*) FILTER (WHERE admin_status=\'PUBLISHED\')::int AS published, COUNT(*) FILTER (WHERE admin_status=\'ARCHIVED\')::int AS archived FROM maintenance_programs'),
    db.one('SELECT COUNT(*)::int AS total FROM fault_codes'),
    db.one('SELECT COUNT(*)::int AS total FROM notifications'),
    db.many(`SELECT p.id, u.name AS professional_name, p.specialty, p.city, p.profile_type, p.verification_status, p.is_certified, p.is_active
      FROM professionals p JOIN users u ON u.id=p.user_id
      WHERE p.verification_status='UNVERIFIED' ORDER BY u.created_at DESC LIMIT 6`),
    db.many('SELECT id,name,email,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 5'),
    db.many(`SELECT a.action, a.entity, a.created_at, u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.created_at DESC LIMIT 10`)
  ]);
  res.json({
    users, vehicles, professionals: pro, suppliers, service_requests: sr, appointments: appts,
    interventions: intvs, diagnostics: diags, quotes, warranties: watts, payments: py,
    part_orders: po, disputes, reviews, programs: progs, fault_codes: faults, notifications: notifs,
    pending_verifications: pendV, recent_users: recents, recent_audit: auditLogs
  });
}));

router.get('/stats', wrap(async (req, res) => {
  const d = await db.one('SELECT COUNT(*)::int AS total FROM users');
  res.json({ users: { total: d.total }, ok: true });
}));

/* ===== USERS ===== */
router.get('/users', wrap(async (req, res) => {
  const { role, q, status } = req.query;
  const conds = []; const params = [];
  if (role) { params.push(role); conds.push(`u.role=$${params.length}`); }
  if (status) { params.push(status); conds.push(`u.status=$${params.length}`); }
  if (q) { params.push(`%${q}%`); conds.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rows = await db.many(`SELECT u.id,u.name,u.email,u.phone,u.role,u.status,u.created_at,
    (SELECT COUNT(*) FROM vehicles v WHERE v.owner_id=u.id)::int AS vehicles_count
    FROM users u ${where} ORDER BY u.created_at DESC LIMIT 500`);
  res.json({ users: rows });
}));

router.get('/users/:id', wrap(async (req, res) => {
  const u = await db.one(`SELECT u.id,u.name,u.email,u.phone,u.role,u.status,u.created_at,
    (SELECT COUNT(*) FROM vehicles v WHERE v.owner_id=u.id)::int AS vehicles_count
    FROM users u WHERE u.id=$1`, [req.params.id]);
  if (!u) throw new HttpError(404, 'Utilisateur introuvable');
  const pro = await db.one('SELECT * FROM professionals WHERE user_id=$1', [req.params.id]).catch(() => null);
  const sup = await db.one('SELECT * FROM suppliers WHERE user_id=$1', [req.params.id]).catch(() => null);
  res.json({ user: u, professional: pro, supplier: sup });
}));

router.patch('/users/:id', requirePermission('users.roles.assign'), wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!cur) throw new HttpError(404, 'Utilisateur introuvable');
  if (cur.id === req.user.sub && (req.body.status === 'SUSPENDED')) throw new HttpError(400, 'Impossible de suspendre votre propre compte');
  const sets = []; const params = []; let i = 1;
  if (req.body.role) {
    if (!ROLES.includes(req.body.role)) throw new HttpError(400, 'Rôle invalide');
    sets.push(`role=$${i++}`); params.push(req.body.role);
  }
  if (req.body.status) {
    if (!['ACTIVE', 'SUSPENDED'].includes(req.body.status)) throw new HttpError(400, 'Statut invalide');
    sets.push(`status=$${i++}`); params.push(req.body.status);
  }
  if (!sets.length) throw new HttpError(400, 'Aucune modification fournie');
  params.push(req.params.id);
  const updated = await db.one(`UPDATE users SET ${sets.join(', ')} WHERE id=$${i} RETURNING id,name,email,role,status`, params);
  await auditChange(req, 'admin.update_user', 'user', updated.id,
    { role: cur.role, status: cur.status },
    { role: updated.role, status: updated.status },
    { via: 'role' in req.body ? 'permission users.roles.assign' : 'admin' });
  res.json({ user: updated });
}));

/* ===== VEHICLES ===== */
router.get('/vehicles', wrap(async (req, res) => {
  const q = req.query.q;
  const rows = await db.many(`SELECT v.*, u.name AS owner_name, u.email AS owner_email,
    (SELECT COUNT(*) FROM interventions i WHERE i.vehicle_id=v.id)::int AS interventions_count
    FROM vehicles v JOIN users u ON u.id=v.owner_id
    WHERE $1::text IS NULL OR v.plate ILIKE $1 OR v.vin ILIKE $1 OR u.name ILIKE $1 OR v.make ILIKE $1 OR v.model ILIKE $1
    ORDER BY v.created_at DESC LIMIT 500`, [q ? `%${q}%` : null]);
  res.json({ vehicles: rows });
}));

router.get('/vehicles/:id', wrap(async (req, res) => {
  const v = await db.one(`SELECT v.*, u.name AS owner_name, u.email AS owner_email FROM vehicles v JOIN users u ON u.id=v.owner_id WHERE v.id=$1`, [req.params.id]);
  if (!v) throw new HttpError(404, 'Véhicule introuvable');
  const stats = await db.one(`SELECT COUNT(*)::int AS interventions, COUNT(*) FILTER (WHERE status='CLOSED')::int AS closed,
    (SELECT COUNT(*) FROM maintenance_records mr WHERE mr.vehicle_id=$1 AND mr.type='ACTUAL')::int AS maintenance_records FROM interventions i WHERE i.vehicle_id=$1`, [req.params.id]);
  res.json({ vehicle: v, stats });
}));

/* ===== PROFESSIONALS (all / garages / technicians / experts) ===== */
const PRO_KIND = {
  garages: `(p.garage_id IS NOT NULL OR u.role='GARAGE')`,
  technicians: `(u.role='MECANICIEN' OR p.profile_type='MOBILE')`,
  experts: `(p.profile_type IN ('DIAGNOSTIC','SPECIALIST'))`,
};

router.get('/professionals', wrap(async (req, res) => {
  const kind = req.query.kind || 'all';
  const q = req.query.q;
  const kindCond = kind === 'all' ? '' : 'AND ' + (PRO_KIND[kind] || PRO_KIND.all);
  const qCond = q ? `AND (u.name ILIKE $1 OR p.specialty ILIKE $1 OR p.city ILIKE $1)` : '';
  const params = q ? [`%${q}%`] : [];
  const rows = await db.many(`SELECT p.id, u.name AS professional_name, u.email, u.phone, p.specialty, p.city,
    p.rating, p.rating_count, p.profile_type, p.is_active, p.verification_status, p.verified_at,
    CASE WHEN p.attestation_doc_ids IS NULL THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(p.attestation_doc_ids)) END AS attestation_doc_ids,
    p.is_certified, p.certified_at, p.satisfaction_rate, p.experience_years, u.created_at AS created_at,
    g.name AS garage_name,
    (SELECT COUNT(*) FROM professional_certifications pc WHERE pc.professional_id=p.id)::int AS certifications_count,
    (SELECT COUNT(*) FROM professional_services ps WHERE ps.professional_id=p.id)::int AS services_count
    FROM professionals p JOIN users u ON u.id=p.user_id LEFT JOIN garages g ON g.id=p.garage_id
    WHERE 1=1 ${kindCond} ${qCond}
    ORDER BY p.verification_status='UNVERIFIED' DESC, p.rating DESC LIMIT 500`, params);
  const summary = await db.one(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE p.verification_status='VERIFIED')::int AS verified,
    COUNT(*) FILTER (WHERE p.is_certified)::int AS certified,
    COUNT(*) FILTER (WHERE p.verification_status='UNVERIFIED')::int AS pending
    FROM professionals p ${kind === 'all' ? '' : 'JOIN users u ON u.id=p.user_id ' + (PRO_KIND[kind] ? 'WHERE ' + PRO_KIND[kind] : '')}`);
  res.json({ professionals: rows, summary });
}));

router.patch('/professionals/:id/verify', wrap(async (req, res) => {
  const { status, note } = req.body;
  if (!['VERIFIED', 'UNVERIFIED', 'REJECTED'].includes(status)) throw new HttpError(400, 'Statut invalide');
  const updated = await db.one(`UPDATE professionals SET verification_status=$1, verification_note=$2,
    verified_by=$3, verified_at=CASE WHEN $1='VERIFIED' THEN now() ELSE NULL END
    WHERE id=$4 RETURNING id, verification_status, is_certified`, [status, note || '', req.user.sub, req.params.id]);
  if (!updated) throw new HttpError(404, 'Professionnel introuvable');
  await audit(req, 'admin.verify_professional', 'professional', updated.id, { status, note: note || '' });
  res.json({ professional: updated });
}));

router.patch('/professionals/:id/certify', wrap(async (req, res) => {
  const certified = !!req.body.certified;
  const updated = await db.one(`UPDATE professionals SET is_certified=$1, certified_by=$2,
    certified_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$3 RETURNING id, is_certified, verification_status`,
    [certified, req.user.sub, req.params.id]);
  if (!updated) throw new HttpError(404, 'Professionnel introuvable');
  await audit(req, 'admin.certify_professional', 'professional', updated.id, { certified });
  res.json({ professional: updated });
}));

router.patch('/professionals/:id', wrap(async (req, res) => {
  const sets = []; const params = []; let i = 1;
  if (typeof req.body.is_active === 'boolean') { sets.push(`is_active=$${i++}`); params.push(req.body.is_active); }
  if (typeof req.body.specialty === 'string' && req.body.specialty.trim()) { sets.push(`specialty=$${i++}`); params.push(req.body.specialty.trim()); }
  if (typeof req.body.city === 'string') { sets.push(`city=$${i++}`); params.push(req.body.city); }
  if (!sets.length) throw new HttpError(400, 'Aucune modification fournie');
  params.push(req.params.id);
  const updated = await db.one(`UPDATE professionals SET ${sets.join(', ')} WHERE id=$${i} RETURNING id, is_active, specialty, city`, params);
  if (!updated) throw new HttpError(404, 'Professionnel introuvable');
  await audit(req, 'admin.update_professional', 'professional', updated.id, req.body);
  res.json({ professional: updated });
}));

router.get('/professionals/:id', wrap(async (req, res) => {
  const p = await db.one(`SELECT p.*, u.name AS professional_name, u.email, u.phone, u.created_at AS created_at, g.name AS garage_name, g.address AS garage_address, g.city AS garage_city
    FROM professionals p JOIN users u ON u.id=p.user_id LEFT JOIN garages g ON g.id=p.garage_id WHERE p.id=$1`, [req.params.id]);
  if (!p) throw new HttpError(404, 'Professionnel introuvable');
  const certifications = await db.many('SELECT * FROM professional_certifications WHERE professional_id=$1 ORDER BY obtained_at DESC', [req.params.id]);
  const brands = await db.many('SELECT brand FROM professional_brands WHERE professional_id=$1', [req.params.id]);
  const services = await db.many('SELECT * FROM professional_services WHERE professional_id=$1 ORDER BY created_at', [req.params.id]);
  const ratings = await db.one(`SELECT COUNT(*)::int AS total, COALESCE(AVG(overall_stars),0)::numeric(3,2) AS avg_stars FROM ratings WHERE professional_id=$1`, [req.params.id]).catch(() => ({ total: 0, avg_stars: 0 }));
  res.json({ professional: p, certifications, brands, services, ratings });
}));

/* ===== SUPPLIERS ===== */
router.get('/suppliers', wrap(async (req, res) => {
  const rows = await db.many(`SELECT s.*, u.name AS user_name,
    (SELECT COUNT(*) FROM parts pa WHERE pa.supplier_id=s.id)::int AS parts_count
    FROM suppliers s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.created_at DESC LIMIT 500`);
  res.json({ suppliers: rows });
}));

router.patch('/suppliers/:id/verify', wrap(async (req, res) => {
  const verified = !!req.body.verified;
  const updated = await db.one(`UPDATE suppliers SET verified=$1, verification_status=CASE WHEN $1 THEN 'VERIFIED' ELSE 'PENDING' END,
    verified_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2 RETURNING id, name, verified, verification_status`,
    [verified, req.params.id]);
  if (!updated) throw new HttpError(404, 'Fournisseur introuvable');
  await audit(req, 'admin.verify_supplier', 'supplier', updated.id, { verified });
  res.json({ supplier: updated });
}));

router.patch('/suppliers/:id', wrap(async (req, res) => {
  const updated = await db.one(`UPDATE suppliers SET is_active=$1, name=$2 WHERE id=$3 RETURNING id, name, is_active`,
    [typeof req.body.is_active === 'boolean' ? req.body.is_active : true, req.body.name || (await db.one('SELECT name FROM suppliers WHERE id=$1', [req.params.id])).name, req.params.id]);
  if (!updated) throw new HttpError(404, 'Fournisseur introuvable');
  await audit(req, 'admin.update_supplier', 'supplier', updated.id, req.body);
  res.json({ supplier: updated });
}));

/* ===== FLUX OPÉRATIONNELS ===== */
async function listAll(sql, label) { return db.many(sql); }

router.get('/service-requests', wrap(async (req, res) => {
  const rows = await db.many(`SELECT sr.*, u.name AS client_name, pu.name AS professional_name, v.make, v.model, v.plate
    FROM service_requests sr JOIN users u ON u.id=sr.user_id LEFT JOIN vehicles v ON v.id=sr.vehicle_id
    LEFT JOIN professionals p ON p.id=sr.professional_id LEFT JOIN users pu ON pu.id=p.user_id
    ORDER BY sr.created_at DESC LIMIT 500`);
  res.json({ service_requests: rows });
}));

router.get('/appointments', wrap(async (req, res) => {
  const rows = await db.many(`SELECT a.*, v.make, v.model, v.plate, u.name AS client_name, p.name AS pro_name
    FROM appointments a JOIN vehicles v ON v.id=a.vehicle_id JOIN users u ON u.id=v.owner_id
    LEFT JOIN professionals pr ON pr.id=a.professional_id LEFT JOIN users p ON p.id=pr.user_id
    ORDER BY a.scheduled_at DESC LIMIT 500`);
  res.json({ appointments: rows });
}));

router.get('/diagnostics', wrap(async (req, res) => {
  const diagnostics = await db.many(`SELECT d.*, i.status, v.make, v.model, v.plate, u.name AS author_name
    FROM diagnostics d JOIN interventions i ON i.id=d.intervention_id JOIN vehicles v ON v.id=i.vehicle_id
    JOIN users u ON u.id=d.author_id ORDER BY d.created_at DESC LIMIT 300`);
  const sessions = await db.many(`SELECT s.*, v.make, v.model, v.plate FROM diagnostic_sessions s
    JOIN vehicles v ON v.id=s.vehicle_id ORDER BY s.created_at DESC LIMIT 300`);
  res.json({ diagnostics, sessions });
}));

router.get('/quotes', wrap(async (req, res) => {
  const rows = await db.many(`SELECT q.*, v.make, v.model, v.plate, u.name AS client_name, pu.name AS pro_name, i.status AS intervention_status
    FROM quotes q JOIN interventions i ON i.id=q.intervention_id JOIN vehicles v ON v.id=i.vehicle_id
    JOIN users u ON u.id=v.owner_id LEFT JOIN professionals p ON p.id=i.professional_id LEFT JOIN users pu ON pu.id=p.user_id
    ORDER BY q.created_at DESC LIMIT 500`);
  const totals = await db.one(`SELECT COUNT(*)::int AS total, COALESCE(SUM(total_cents),0)::bigint AS total_cents,
    COALESCE(SUM(total_cents) FILTER (WHERE q.status='APPROVED'),0)::bigint AS approved_cents
    FROM quotes q`);
  res.json({ quotes: rows, totals });
}));

router.get('/repairs', wrap(async (req, res) => {
  const rows = await db.many(`SELECT i.*, v.make, v.model, v.plate, u.name AS client_name, pu.name AS professional_name,
    q.total_cents AS quote_total_cents
    FROM interventions i JOIN vehicles v ON v.id=i.vehicle_id JOIN users u ON u.id=v.owner_id
    LEFT JOIN professionals p ON p.id=i.professional_id LEFT JOIN users pu ON pu.id=p.user_id
    LEFT JOIN quotes q ON q.intervention_id=i.id
    ORDER BY i.created_at DESC LIMIT 500`);
  res.json({ repairs: rows });
}));

router.get('/warranties', wrap(async (req, res) => {
  const rows = await db.many(`SELECT w.*, v.make, v.model, v.plate, u.name AS client_name, pu.name AS professional_name,
    (w.ends_on - CURRENT_DATE) AS days_left
    FROM warranties w JOIN interventions i ON i.id=w.intervention_id JOIN vehicles v ON v.id=i.vehicle_id
    JOIN users u ON u.id=v.owner_id LEFT JOIN professionals p ON p.id=i.professional_id LEFT JOIN users pu ON pu.id=p.user_id
    ORDER BY w.ends_on DESC LIMIT 500`);
  res.json({ warranties: rows });
}));

router.get('/payments', wrap(async (req, res) => {
  const rows = await db.many(`SELECT p.*, v.make, v.model, v.plate, u.name AS client_name, pu.name AS professional_name
    FROM payments p JOIN interventions i ON i.id=p.intervention_id JOIN vehicles v ON v.id=i.vehicle_id
    JOIN users u ON u.id=v.owner_id LEFT JOIN professionals pr ON pr.id=i.professional_id LEFT JOIN users pu ON pu.id=pr.user_id
    ORDER BY p.created_at DESC LIMIT 500`);
  const totals = await db.one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='SUCCEEDED')::int AS succeeded,
    COALESCE(SUM(amount_cents) FILTER (WHERE status='SUCCEEDED'),0)::bigint AS revenue_cents,
    COUNT(*) FILTER (WHERE status='PENDING')::int AS pending FROM payments`);
  res.json({ payments: rows, totals });
}));

router.get('/transactions', wrap(async (req, res) => {
  const rows = await db.many(`SELECT * FROM (
    SELECT p.created_at AS date, 'Paiement' AS type, p.id AS entity_id, 'Paiement intervention'::text AS title,
      u.name AS client, p.amount_cents, p.status::text AS status
    FROM payments p JOIN interventions i ON i.id=p.intervention_id JOIN vehicles v ON v.id=i.vehicle_id
    JOIN users u ON u.id=v.owner_id
    UNION ALL
    SELECT po.created_at AS date, 'Commande pièce' AS type, po.id AS entity_id, po.part_name AS title,
      u.name AS client, po.total_cents, po.status::text AS status
    FROM part_orders po JOIN users u ON u.id=po.user_id
  ) t ORDER BY date DESC LIMIT 500`);
  const totals = await db.one(`SELECT
    COALESCE(SUM(amount_cents) FILTER (WHERE status='SUCCEEDED'),0)::bigint AS payments_revenue,
    COALESCE(SUM(amount_cents) FILTER (WHERE status='DELIVERED'),0)::bigint AS orders_revenue FROM (
      SELECT amount_cents, status::text AS status FROM payments
      UNION ALL SELECT total_cents, status::text FROM part_orders
    ) t`);
  res.json({ transactions: rows, totals });
}));

router.get('/commissions', wrap(async (req, res) => {
  const rows = await db.many(`SELECT c.*, pu.name AS professional_name, v.make, v.model, v.plate, au.name AS created_by_name
    FROM commissions c LEFT JOIN professionals p ON p.id=c.professional_id LEFT JOIN users pu ON pu.id=p.user_id
    LEFT JOIN payments pm ON pm.id=c.payment_id LEFT JOIN interventions i ON i.id=pm.intervention_id
    LEFT JOIN vehicles v ON v.id=i.vehicle_id LEFT JOIN users au ON au.id=c.created_by
    ORDER BY c.created_at DESC LIMIT 500`);
  const totals = await db.one(`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount_cents) FILTER (WHERE status='PENDING'),0)::bigint AS pending_cents,
    COALESCE(SUM(amount_cents) FILTER (WHERE status='PAID'),0)::bigint AS paid_cents FROM commissions`);
  res.json({ commissions: rows, totals });
}));

router.post('/commissions', wrap(async (req, res) => {
  const amount = Math.round(Number(req.body.amount_cents) || 0);
  if (amount <= 0) throw new HttpError(400, 'Montant invalide');
  const c = await db.one(`INSERT INTO commissions (payment_id, professional_id, amount_cents, rate_percent, status, note, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.body.payment_id || null, req.body.professional_id || null, amount, Number(req.body.rate_percent) || 0, req.body.status === 'PAID' ? 'PAID' : 'PENDING', req.body.note || '', req.user.sub]);
  await audit(req, 'admin.create_commission', 'commission', c.id, { amount_cents: c.amount_cents });
  res.status(201).json({ commission: c });
}));

router.patch('/commissions/:id', wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM commissions WHERE id=$1', [req.params.id]);
  if (!cur) throw new HttpError(404, 'Commission introuvable');
  const sets = []; const params = []; let i = 1;
  let status = cur.status;
  if (req.body.status) {
    if (!['PENDING', 'PAID'].includes(req.body.status)) throw new HttpError(400, 'Statut invalide');
    status = req.body.status;
    sets.push(`status=$${i++}`); params.push(status);
  }
  if (typeof req.body.amount_cents === 'number') { sets.push(`amount_cents=$${i++}`); params.push(Math.round(req.body.amount_cents)); }
  if (req.body.note) { sets.push(`note=$${i++}`); params.push(req.body.note); }
  if (!sets.length) throw new HttpError(400, 'Aucune modification');
  sets.push(`paid_at=${status === 'PAID' && !cur.paid_at ? 'now()' : 'paid_at'}`);
  params.push(req.params.id);
  await db.one(`UPDATE commissions SET ${sets.join(', ')} WHERE id=$${i}`, params);
  await audit(req, 'admin.update_commission', 'commission', req.params.id, req.body);
  res.json({ message: 'Commission mise à jour' });
}));

/* ===== PIÈCES & COMMANDES ===== */
router.get('/parts', wrap(async (req, res) => {
  const rows = await db.many(`SELECT p.*, s.name AS supplier_name, s.verified AS supplier_verified
    FROM parts p LEFT JOIN suppliers s ON s.id=p.supplier_id
    ORDER BY (p.stock_quantity <= p.min_stock) DESC, p.created_at DESC LIMIT 500`);
  const totals = await db.one(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE stock_quantity <= min_stock)::int AS low_stock,
    COALESCE(SUM(unit_price_cents * stock_quantity),0)::bigint AS stock_value_cents FROM parts`);
  res.json({ parts: rows, totals });
}));

router.patch('/parts/:id', wrap(async (req, res) => {
  const updated = await db.one(`UPDATE parts SET active=$1, unit_price_cents=$2, stock_quantity=$3, min_stock=$4, updated_at=now() WHERE id=$5 RETURNING id, reference, active`,
    [typeof req.body.active === 'boolean' ? req.body.active : true, Math.round(Number(req.body.unit_price_cents) || 0), Math.round(Number(req.body.stock_quantity) || 0), Math.round(Number(req.body.min_stock) || 0), req.params.id]);
  if (!updated) throw new HttpError(404, 'Pièce introuvable');
  await audit(req, 'admin.update_part', 'part', updated.id, req.body);
  res.json({ part: updated });
}));

router.get('/orders', wrap(async (req, res) => {
  const rows = await db.many(`SELECT po.*, u.name AS client_name, s.name AS supplier_name
    FROM part_orders po JOIN users u ON u.id=po.user_id LEFT JOIN suppliers s ON s.id=po.supplier_id
    ORDER BY po.created_at DESC LIMIT 500`);
  res.json({ orders: rows });
}));

router.patch('/orders/:id/status', wrap(async (req, res) => {
  const status = req.body.status;
  if (!ORDER_STATUS.includes(status)) throw new HttpError(400, 'Statut invalide');
  const updated = await db.one(`UPDATE part_orders SET status=$1, updated_at=now() WHERE id=$2 RETURNING id, part_reference, status`, [status, req.params.id]);
  if (!updated) throw new HttpError(404, 'Commande introuvable');
  await audit(req, 'admin.update_order_status', 'part_order', updated.id, { status });
  res.json({ order: { id: updated.id, part_reference: updated.part_reference, status: updated.status } });
}));

/* ===== LITIGES & AVIS ===== */
router.get('/disputes', wrap(async (req, res) => {
  const rows = await db.many(`SELECT d.*, u.name AS client_name, pu.name AS professional_name
    FROM disputes d JOIN users u ON u.id=d.user_id LEFT JOIN professionals p ON p.id=d.professional_id LEFT JOIN users pu ON pu.id=p.user_id
    ORDER BY d.created_at DESC LIMIT 500`);
  res.json({ disputes: rows });
}));

router.patch('/disputes/:id/status', wrap(async (req, res) => {
  const status = req.body.status;
  if (!['OPEN', 'IN_REVIEW', 'RESOLVED', 'ESCALATED', 'CLOSED'].includes(status)) throw new HttpError(400, 'Statut invalide');
  const updated = await db.one(`UPDATE disputes SET status=$1, resolution_notes=COALESCE($2, resolution_notes),
    resolved_at=CASE WHEN $1 IN ('RESOLVED','CLOSED') THEN now() ELSE resolved_at END WHERE id=$3 RETURNING id, status`,
    [status, req.body.resolution_notes || null, req.params.id]);
  if (!updated) throw new HttpError(404, 'Litige introuvable');
  await audit(req, 'admin.update_dispute', 'dispute', updated.id, { status });
  res.json({ dispute: updated });
}));

router.get('/reviews', wrap(async (req, res) => {
  const rows = await db.many(`SELECT r.*, u.name AS author_name, pu.name AS professional_name, v.make, v.model, v.plate
    FROM ratings r JOIN users u ON u.id=r.author_id LEFT JOIN professionals p ON p.id=r.professional_id LEFT JOIN users pu ON pu.id=p.user_id
    LEFT JOIN interventions i ON i.id=r.intervention_id LEFT JOIN vehicles v ON v.id=i.vehicle_id
    ORDER BY r.created_at DESC LIMIT 500`);
  res.json({ reviews: rows });
}));

/* ===== PROGRAMMES D'ENTRETIEN (33) ===== */
async function latestVersion(programId) {
  return db.one(`SELECT id, version, effective_date FROM maintenance_program_versions
    WHERE program_id=$1 ORDER BY version DESC LIMIT 1`, [programId]);
}

async function buildProgramWithIntervals(client, program, versionFields, intervals) {
  const prog = await client.query(
    `INSERT INTO maintenance_programs (manufacturer_id, engine_id, name, description, origin) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [program.manufacturer_id, program.engine_id || null, program.name || 'Programme standard', program.description || '', program.origin || 'MANUAL']);
  const fields = versionFields || {};
  const ver = await client.query(
    `INSERT INTO maintenance_program_versions (program_id, version, effective_date, notes) VALUES ($1,1,$2,$3) RETURNING *`,
    [prog.rows[0].id, fields.effective_date || null, fields.notes || '']);
  for (const intv of (intervals || [])) {
    if (!intv.label || !Number(intv.interval_km) || !Number(intv.interval_months)) throw new HttpError(400, 'Intervalle invalide (label + interval_km + interval_months)');
    const iv = await client.query(
      `INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [ver.rows[0].id, intv.label, Math.round(intv.interval_km), Math.round(intv.interval_months), intv.sort_order || 0]);
    for (const op of (intv.operations || [])) {
      await client.query(`INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [iv.rows[0].id, op.label, op.description || '', !!op.is_check_only, op.sort_order || 0]);
    }
    for (const ch of (intv.checks || [])) {
      await client.query(`INSERT INTO maintenance_checks (interval_id, label, result_type, sort_order) VALUES ($1,$2,$3,$4)`,
        [iv.rows[0].id, ch.label, ch.result_type || 'OK_KO', ch.sort_order || 0]);
    }
  }
  return { program: prog.rows[0], version: ver.rows[0] };
}

router.get('/maintenance-programs', wrap(async (req, res) => {
  const rows = await db.many(`SELECT mp.id, mp.name, mp.description, mp.admin_status, mp.origin, mp.is_active,
    mp.published_at, mp.archived_at, mp.created_at, m.name AS manufacturer_name, e.name AS engine_name, e.fuel_type,
    (SELECT COUNT(*) FROM maintenance_program_versions mpv WHERE mpv.program_id=mp.id)::int AS versions_count
    FROM maintenance_programs mp LEFT JOIN manufacturers m ON m.id=mp.manufacturer_id LEFT JOIN engines e ON e.id=mp.engine_id
    ORDER BY mp.created_at DESC LIMIT 500`);
  const summary = await db.one(`SELECT
    COUNT(*) FILTER (WHERE admin_status='DRAFT')::int AS draft,
    COUNT(*) FILTER (WHERE admin_status='PUBLISHED')::int AS published,
    COUNT(*) FILTER (WHERE admin_status='ARCHIVED')::int AS archived FROM maintenance_programs`);
  res.json({ programs: rows, summary });
}));

router.get('/maintenance-programs/manufacturers', wrap(async (req, res) => {
  const manufacturers = await db.many(`SELECT m.id, m.name, m.country FROM manufacturers m ORDER BY m.name`);
  res.json({ manufacturers });
}));

router.get('/maintenance-programs/:id', wrap(async (req, res) => {
  const p = await db.one(`SELECT mp.*, m.name AS manufacturer_name, e.name AS engine_name FROM maintenance_programs mp
    LEFT JOIN manufacturers m ON m.id=mp.manufacturer_id LEFT JOIN engines e ON e.id=mp.engine_id WHERE mp.id=$1`, [req.params.id]);
  if (!p) throw new HttpError(404, 'Programme introuvable');
  const versions = await db.many(`SELECT mpv.*, 
    (SELECT COUNT(*) FROM maintenance_intervals mi WHERE mi.program_version_id=mpv.id)::int AS intervals_count
    FROM maintenance_program_versions mpv WHERE mpv.program_id=$1 ORDER BY mpv.version DESC`, [req.params.id]);
  const intervals = await db.many(`SELECT mi.*,
    (SELECT json_agg(json_build_object('id', mop.id, 'label', mop.label, 'description', mop.description, 'is_check_only', mop.is_check_only, 'sort_order', mop.sort_order) ORDER BY mop.sort_order) FROM maintenance_operations mop WHERE mop.interval_id=mi.id) AS operations,
    (SELECT json_agg(json_build_object('id', mc.id, 'label', mc.label, 'result_type', mc.result_type) ORDER BY mc.sort_order) FROM maintenance_checks mc WHERE mc.interval_id=mi.id) AS checks
    FROM maintenance_intervals mi WHERE mi.program_version_id=(SELECT id FROM maintenance_program_versions WHERE program_id=$1 ORDER BY version DESC LIMIT 1)
    ORDER BY mi.sort_order, mi.interval_km`, [req.params.id]);
  res.json({ program: p, versions, intervals, manufacturers: await db.many('SELECT id, name FROM manufacturers ORDER BY name'), engines: await db.many('SELECT e.id, e.name, g.name AS model_name, m.name AS make FROM engines e JOIN vehicle_generations g ON g.id=e.generation_id JOIN vehicle_models vm ON vm.id=g.model_id JOIN manufacturers m ON m.id=vm.manufacturer_id ORDER BY m.name, vm.name') });
}));

router.post('/maintenance-programs', wrap(async (req, res) => {
  if (!req.body.manufacturer_id) throw new HttpError(400, 'Constructeur requis');
  const result = await db.tx((client) => buildProgramWithIntervals(client, req.body, req.body.version, req.body.intervals));
  await audit(req, 'admin.create_program', 'maintenance_program', result.program.id, { name: result.program.name });
  res.status(201).json(result);
}));

router.post('/maintenance-programs/import', wrap(async (req, res) => {
  const body = req.body;
  const data = body.format === 'json' && body.program ? body.program : body;
  const prog = { manufacturer_id: data.manufacturer_id, engine_id: data.engine_id, name: data.name || 'Programme importé', description: data.description || '', origin: 'IMPORT' };
  const result = await db.tx((client) => buildProgramWithIntervals(client, prog, { effective_date: data.effective_date, notes: `Importé le ${new Date().toISOString().slice(0,10)}` }, data.intervals));
  await audit(req, 'admin.import_program', 'maintenance_program', result.program.id, { name: result.program.name, intervals: (data.intervals || []).length });
  res.status(201).json(result);
}));

router.patch('/maintenance-programs/:id', wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM maintenance_programs WHERE id=$1', [req.params.id]);
  if (!cur) throw new HttpError(404, 'Programme introuvable');
  const sets = []; const params = []; let i = 1;
  if (typeof req.body.name === 'string' && req.body.name.trim()) { sets.push(`name=$${i++}`); params.push(req.body.name.trim()); }
  if (typeof req.body.description === 'string') { sets.push(`description=$${i++}`); params.push(req.body.description); }
  let status = cur.admin_status;
  if (req.body.admin_status) {
    if (!PROG_STATUS.includes(req.body.admin_status)) throw new HttpError(400, 'Statut invalide');
    status = req.body.admin_status;
    if (status === 'PUBLISHED') { sets.push(`is_active=true`); sets.push(`published_at=now()`); sets.push(`archived_at=NULL`); }
    else if (status === 'ARCHIVED') { sets.push(`is_active=false`); sets.push(`archived_at=now()`); }
    else if (status === 'DRAFT') { sets.push(`is_active=false`); sets.push(`archived_at=NULL`); }
    sets.push(`admin_status=$${i++}`); params.push(status);
  }
  if (typeof req.body.is_active === 'boolean' && !req.body.admin_status && !req.body.disable) { sets.push(`is_active=$${i++}`); params.push(req.body.is_active); }
  if (req.body.disable) { sets.push(`is_active=false`); }
  if (!sets.length) throw new HttpError(400, 'Aucune modification fournie');
  sets.push(`updated_at=now()`);
  params.push(req.params.id);
  const updated = await db.one(`UPDATE maintenance_programs SET ${sets.join(', ')} WHERE id=$${i} RETURNING id, name, admin_status, is_active`, params);
  await auditChange(req, 'admin.update_program', 'maintenance_program', updated.id,
    { admin_status: cur.admin_status, is_active: cur.is_active },
    { admin_status: updated.admin_status, is_active: updated.is_active },
    { name: req.body.name });
  res.json({ program: updated });
}));

router.post('/maintenance-programs/:id/version', wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM maintenance_programs WHERE id=$1', [req.params.id]);
  if (!cur) throw new HttpError(404, 'Programme introuvable');
  const latest = await latestVersion(req.params.id);
  const nextVersion = latest ? latest.version + 1 : 1;
  const created = await db.tx(async (client) => {
    const vNew = await client.query(
      `INSERT INTO maintenance_program_versions (program_id, version, effective_date, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, nextVersion, req.body.effective_date || null, req.body.notes || `Version ${nextVersion}`]);
    const srcIntervals = await client.query(`SELECT * FROM maintenance_intervals WHERE program_version_id=$1 ORDER BY sort_order, interval_km`, [latest.id]);
    for (const sIv of srcIntervals.rows) {
      const opRows = await client.query(`SELECT * FROM maintenance_operations WHERE interval_id=$1 ORDER BY sort_order`, [sIv.id]);
      const chkRows = await client.query(`SELECT * FROM maintenance_checks WHERE interval_id=$1 ORDER BY sort_order`, [sIv.id]);
      const nIv = await client.query(
        `INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [vNew.rows[0].id, sIv.label, sIv.interval_km, sIv.interval_months, sIv.sort_order]);
      for (const op of opRows.rows) await client.query(`INSERT INTO maintenance_operations (interval_id, label, description, is_check_only, sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [nIv.rows[0].id, op.label, op.description, op.is_check_only, op.sort_order]);
      for (const ch of chkRows.rows) await client.query(`INSERT INTO maintenance_checks (interval_id, label, result_type, sort_order) VALUES ($1,$2,$3,$4)`,
        [nIv.rows[0].id, ch.label, ch.result_type, ch.sort_order]);
    }
    return vNew.rows[0];
  });
  await audit(req, 'admin.program_new_version', 'maintenance_program', req.params.id, { version: nextVersion });
  res.status(201).json({ version: created });
}));

router.post('/maintenance-programs/:id/interval', wrap(async (req, res) => {
  const latest = await latestVersion(req.params.id);
  if (!latest) throw new HttpError(404, 'Aucune version');
  const iv = req.body;
  if (!iv.label || !Number(iv.interval_km) || !Number(iv.interval_months)) throw new HttpError(400, 'Intervalle invalide');
  const created = await db.one(`INSERT INTO maintenance_intervals (program_version_id, label, interval_km, interval_months, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [latest.id, iv.label, Math.round(iv.interval_km), Math.round(iv.interval_months), iv.sort_order || 0]);
  await audit(req, 'admin.program_add_interval', 'maintenance_program', req.params.id, { interval_id: created.id, label: created.label });
  res.status(201).json({ interval: created });
}));

router.patch('/maintenance-programs/:id/interval/:intervalId', wrap(async (req, res) => {
  const sets = []; const params = []; let i = 1;
  if (typeof req.body.label === 'string' && req.body.label.trim()) { sets.push(`label=$${i++}`); params.push(req.body.label.trim()); }
  if (typeof req.body.interval_km === 'number') { sets.push(`interval_km=$${i++}`); params.push(Math.round(req.body.interval_km)); }
  if (typeof req.body.interval_months === 'number') { sets.push(`interval_months=$${i++}`); params.push(Math.round(req.body.interval_months)); }
  if (typeof req.body.sort_order === 'number') { sets.push(`sort_order=$${i++}`); params.push(req.body.sort_order); }
  if (!sets.length) throw new HttpError(400, 'Aucune modification');
  params.push(req.params.intervalId);
  await db.one(`UPDATE maintenance_intervals SET ${sets.join(', ')} WHERE id=$${i}`, params);
  await audit(req, 'admin.program_update_interval', 'maintenance_program', req.params.id, { interval_id: req.params.intervalId, meta: req.body });
  res.json({ message: 'Intervalle mis à jour' });
}));

router.delete('/maintenance-programs/:id/interval/:intervalId', wrap(async (req, res) => {
  await db.query('DELETE FROM maintenance_intervals WHERE id=$1', [req.params.intervalId]);
  await audit(req, 'admin.program_delete_interval', 'maintenance_program', req.params.id, { interval_id: req.params.intervalId });
  res.json({ message: 'Intervalle supprimé' });
}));

/* ===== CODES DÉFAUT ===== */
router.get('/fault-codes', wrap(async (req, res) => {
  const rows = await db.many(`SELECT f.*, s.name AS system_name, s.code_prefix,
    (SELECT COUNT(*) FROM fault_code_causes c WHERE c.fault_code_id=f.id)::int AS causes_count,
    (SELECT COUNT(*) FROM fault_code_tests t WHERE t.fault_code_id=f.id)::int AS tests_count
    FROM fault_codes f LEFT JOIN fault_code_systems s ON s.id=f.system_id ORDER BY f.code LIMIT 500`);
  const systems = await db.many('SELECT * FROM fault_code_systems ORDER BY code_prefix');
  res.json({ fault_codes: rows, systems });
}));

router.post('/fault-codes', wrap(async (req, res) => {
  if (!req.body.code || !req.body.code.trim()) throw new HttpError(400, 'Code requis');
  const created = await db.one(`INSERT INTO fault_codes (code, system_id, interpretation, severity, description)
    VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.body.code.trim().toUpperCase(), req.body.system_id || null, req.body.interpretation || '', req.body.severity || 'MOYENNE', req.body.description || '']);
  await audit(req, 'admin.create_fault_code', 'fault_code', created.id, { code: created.code });
  res.status(201).json({ fault_code: created });
}));

router.patch('/fault-codes/:id', wrap(async (req, res) => {
  const sets = []; const params = []; let i = 1;
  if (req.body.code) { sets.push(`code=$${i++}`); params.push(req.body.code.trim().toUpperCase()); }
  if (typeof req.body.interpretation === 'string') { sets.push(`interpretation=$${i++}`); params.push(req.body.interpretation); }
  if (req.body.severity) { sets.push(`severity=$${i++}`); params.push(req.body.severity); }
  if (typeof req.body.description === 'string') { sets.push(`description=$${i++}`); params.push(req.body.description); }
  if (req.body.system_id !== undefined) { sets.push(`system_id=$${i++}`); params.push(req.body.system_id || null); }
  if (!sets.length) throw new HttpError(400, 'Aucune modification');
  params.push(req.params.id);
  await db.one(`UPDATE fault_codes SET ${sets.join(', ')} WHERE id=$${i} RETURNING id`, params);
  await audit(req, 'admin.update_fault_code', 'fault_code', req.params.id, req.body);
  res.json({ message: 'Code mis à jour' });
}));

router.delete('/fault-codes/:id', wrap(async (req, res) => {
  await db.query('DELETE FROM fault_codes WHERE id=$1', [req.params.id]);
  await audit(req, 'admin.delete_fault_code', 'fault_code', req.params.id, {});
  res.json({ message: 'Code supprimé' });
}));

/* ===== NOTIFICATIONS (admin) ===== */
router.get('/notifications/all', wrap(async (req, res) => {
  const rows = await db.many(`SELECT n.*, u.name AS user_name, u.email AS user_email
    FROM notifications n JOIN users u ON u.id=n.user_id ORDER BY n.created_at DESC LIMIT 300`);
  res.json({ notifications: rows });
}));

router.post('/broadcast', wrap(async (req, res) => {
  const message = (req.body.message || '').trim();
  if (message.length < 3) throw new HttpError(400, 'Message requis');
  const result = await NotificationService.broadcast({ message, key: crypto.createHash('md5').update(message).digest('hex') });
  await audit(req, 'admin.broadcast', 'notification', null, { recipients: result.recipients, message });
  res.json({ message: `Notification envoyée à ${result.recipients} utilisateur(s)`, sent: result.recipients });
}));

/* ===== GÉOGRAPHIE ===== */
router.get('/geography', wrap(async (req, res) => {
  const pro_cities = await db.many(`SELECT COALESCE(NULLIF(p.city,''), 'Non renseignée') AS city, COUNT(*)::int AS professionals
    FROM professionals p GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  const supplier_cities = await db.many(`SELECT COALESCE(NULLIF(SPLIT_PART(s.address, ',', -1), ''), 'Non renseignée') AS city, COUNT(*)::int AS suppliers
    FROM suppliers s GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  const user_cities = await db.many(`SELECT COALESCE(NULLIF(p.city,''), 'Non renseignée') AS city, COUNT(DISTINCT u.id)::int AS users
    FROM users u LEFT JOIN professionals p ON p.user_id=u.id GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  const vehicles = await db.many(`SELECT COALESCE(NULLIF(p.city,''), 'Non renseignée') AS city, COUNT(DISTINCT v.id)::int AS vehicles
    FROM vehicles v JOIN users u ON u.id=v.owner_id LEFT JOIN professionals p ON p.user_id=u.id GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  res.json({ professionals: pro_cities, suppliers: supplier_cities, users: user_cities, vehicles });
}));

/* ===== PARAMÈTRES ===== */
router.get('/settings', wrap(async (req, res) => {
  const rows = await db.many(`SELECT s.*, u.name AS updated_by_name FROM app_settings s LEFT JOIN users u ON u.id=s.updated_by ORDER BY s.key`);
  res.json({ settings: rows });
}));

router.post('/settings', wrap(async (req, res) => {
  const { key, value, type } = req.body;
  if (!key || typeof key !== 'string') throw new HttpError(400, 'Clé requise');
  const created = await db.one(`INSERT INTO app_settings (key, value, type, updated_by) VALUES ($1,$2,$3,$4)
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, type=EXCLUDED.type, updated_by=EXCLUDED.updated_by, updated_at=now()
    RETURNING key, value, type`, [key, String(value ?? ''), type || 'text', req.user.sub]);
  await audit(req, 'admin.set_setting', 'setting', key, { value: created.value });
  res.json({ setting: created });
}));

router.patch('/settings', requirePermission('admin.settings.manage'), wrap(async (req, res) => {
  const entries = (req.body.entries || []).filter(e => e && e.key);
  if (!entries.length) throw new HttpError(400, 'Aucun paramètre fourni');
  for (const e of entries) {
    await db.query(`INSERT INTO app_settings (key, value, type, updated_by) VALUES ($1,$2,$3,$4)
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, type=EXCLUDED.type, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [e.key, String(e.value ?? ''), e.type || 'text', req.user.sub]);
  }
  await audit(req, 'admin.update_settings', 'setting', null, { keys: entries.map(e => e.key) });
  res.json({ message: `${entries.length} paramètre(s) mis à jour` });
}));

/* ===== AUDIT LOGS ===== */
router.get('/audit-logs', requirePermission('admin.audit.view'), wrap(async (req, res) => {
  const { entity, action, q } = req.query;
  const conds = []; const params = [];
  if (entity) { params.push(entity); conds.push(`a.entity=$${params.length}`); }
  if (action) { params.push(action); conds.push(`a.action ILIKE $${params.length}`); }
  if (q) { params.push(`%${q}%`); conds.push(`(u.name ILIKE $${params.length} OR a.action ILIKE $${params.length})`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const rows = await db.many(`SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    ${where} ORDER BY a.created_at DESC LIMIT 500`, params);
  res.json({ logs: rows });
}));

module.exports = router;