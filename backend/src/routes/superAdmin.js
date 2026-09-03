const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { requireSuperConfirm } = require('../middlewares/confirmAuth');
const { audit } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');

// MODULE 76 — CONSOLE SUPER ADMIN.
// Toutes les mutations sensibles passent par requireSuperConfirm (password ou
// OTP) : authentification renforcée avant toute action critique.
const router = express.Router();
router.use(requireAuth);

// Seul un SUPER_ADMIN accède à la console (jamais un simple ADMIN).
router.use(wrap((req, _res, next) => {
  if (!req.user || !req.user.isSuperAdmin) {
    throw new HttpError(403, 'Réservé au super administrateur');
  }
  next();
}));

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

/* ============================= ADMINISTRATEURS ============================= */
router.get('/admins', wrap(async (req, res) => {
  const rows = await db.many(`SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
    (SELECT COUNT(*) FROM user_roles ur JOIN roles r ON r.id=ur.role_id
      WHERE ur.user_id=u.id AND r.code='ADMIN')::int AS role_count
    FROM users u WHERE u.role::text = ANY($1)
    ORDER BY u.created_at DESC`, [ADMIN_ROLES]);
  res.json({ admins: rows });
}));

router.post('/admins', requireSuperConfirm('password'), wrap(async (req, res) => {
  const { name, email, password, role = 'ADMIN' } = req.body || {};
  if (!name || !email || !password) throw new HttpError(400, 'name, email et password requis');
  if (!ADMIN_ROLES.includes(role)) throw new HttpError(400, 'Rôle admin invalide');
  const dup = await db.one('SELECT id FROM users WHERE email=$1', [String(email).toLowerCase()]);
  if (dup) throw new HttpError(409, 'Un compte existe déjà avec cet email');
  if (password.length < 8) throw new HttpError(400, 'Le mot de passe doit faire au moins 8 caractères');
  const hash = await bcrypt.hash(password, 12);
  const u = await db.one(
    `INSERT INTO users (name,email,phone,password_hash,role,status)
     VALUES ($1,$2,$3,$4,$5,'ACTIVE') RETURNING id,name,email,role,status`,
    [name.trim(), String(email).toLowerCase(), req.body.phone || '', hash, role]
  );
  await db.query(`INSERT INTO user_roles (user_id, role_id)
    SELECT $1, r.id FROM roles r WHERE r.code=$2 ON CONFLICT DO NOTHING`, [u.id, role]);
  await audit(req, 'super.admin.create', 'user', u.id, { role });
  res.status(201).json({ admin: u });
}));

router.patch('/admins/:id', requireSuperConfirm('password'), wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!cur) throw new HttpError(404, 'Admin introuvable');
  if (cur.id === req.user.sub) throw new HttpError(400, 'Impossible de modifier votre propre rôle');
  const sets = []; const params = []; let i = 1;
  if (req.body.role) {
    if (!ADMIN_ROLES.includes(req.body.role)) throw new HttpError(400, 'Rôle admin invalide');
    sets.push(`role=$${i++}`); params.push(req.body.role);
  }
  if (req.body.status) {
    if (!['ACTIVE', 'SUSPENDED'].includes(req.body.status)) throw new HttpError(400, 'Statut invalide');
    sets.push(`status=$${i++}`); params.push(req.body.status);
  }
  if (!sets.length) throw new HttpError(400, 'Aucune modification');
  params.push(req.params.id);
  const updated = await db.one(`UPDATE users SET ${sets.join(', ')} WHERE id=$${i} RETURNING id,name,email,role,status`, params);
  if (req.body.role) {
    await db.query(`DELETE FROM user_roles WHERE user_id=$1 AND role_id IN
      (SELECT id FROM roles WHERE code=ANY($2))`, [req.params.id, ADMIN_ROLES]);
    await db.query(`INSERT INTO user_roles (user_id, role_id)
      SELECT $1, r.id FROM roles r WHERE r.code=$2 ON CONFLICT DO NOTHING`, [req.params.id, updated.role]);
  }
  await audit(req, 'super.admin.update', 'user', updated.id,
    { role: cur.role, status: cur.status }, { role: updated.role, status: updated.status });
  res.json({ admin: updated });
}));

router.post('/admins/:id/suspend', requireSuperConfirm('otp'), wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!cur) throw new HttpError(404, 'Admin introuvable');
  if (cur.id === req.user.sub) throw new HttpError(400, 'Impossible de suspendre votre propre compte');
  if (cur.role === 'SUPER_ADMIN') throw new HttpError(400, 'Impossible de suspendre un super administrateur');
  const updated = await db.one('UPDATE users SET status=$1 WHERE id=$2 RETURNING id,name,role,status',
    [req.body.suspend === false ? 'ACTIVE' : 'SUSPENDED', req.params.id]);
  await audit(req, 'super.admin.suspend', 'user', updated.id, { status: updated.status });
  res.json({ admin: updated });
}));

/* ============================= PERMISSIONS ============================= */
router.get('/permissions', wrap(async (req, res) => {
  const roles = await db.many(`SELECT r.id, r.code, r.name, r.description,
    (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id=r.id)::int AS permissions_count
    FROM roles r ORDER BY r.code`);
  const perms = await db.many(`SELECT p.id, p.code, p.module, p.description FROM permissions p ORDER BY p.module, p.code`);
  const mappings = await db.many(`SELECT rp.role_id, rp.permission_id,
    r.code AS role_code, p.code AS permission_code
    FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id`);
  res.json({ roles, permissions: perms, mappings });
}));

router.get('/permissions/role/:roleCode', wrap(async (req, res) => {
  const role = await db.one('SELECT id, code, name FROM roles WHERE code=$1', [req.params.roleCode]);
  if (!role) throw new HttpError(404, 'Rôle introuvable');
  const perms = await db.many(`SELECT p.id, p.code, p.module, p.description
    FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=$1 ORDER BY p.module, p.code`, [role.id]);
  res.json({ role, permissions: perms });
}));

router.post('/permissions/role/:roleCode', requireSuperConfirm('password'), wrap(async (req, res) => {
  const { permission_code } = req.body || {};
  if (!permission_code) throw new HttpError(400, 'permission_code requis');
  const role = await db.one('SELECT id FROM roles WHERE code=$1', [req.params.roleCode]);
  if (!role) throw new HttpError(404, 'Rôle introuvable');
  const perm = await db.one('SELECT id FROM permissions WHERE code=$1', [permission_code]);
  if (!perm) throw new HttpError(404, 'Permission introuvable');
  await db.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)
    ON CONFLICT DO NOTHING`, [role.id, perm.id]);
  await audit(req, 'super.permission.grant', 'role', role.id, { permission_code });
  res.json({ message: 'Permission accordée', role: req.params.roleCode, permission: permission_code });
}));

// Révocation de permission. POST (et non DELETE) : le body de confirmation est
// requis et certains reverse-proxies suppriment le body des requêtes DELETE.
router.post('/permissions/role/:roleCode/revoke', requireSuperConfirm('password'), wrap(async (req, res) => {
  const { permission_id } = req.body || {};
  if (!permission_id) throw new HttpError(400, 'permission_id requis');
  const role = await db.one('SELECT id FROM roles WHERE code=$1', [req.params.roleCode]);
  if (!role) throw new HttpError(404, 'Rôle introuvable');
  if (req.params.roleCode === 'SUPER_ADMIN') throw new HttpError(400, 'Impossible de retirer des permissions à SUPER_ADMIN');
  await db.query('DELETE FROM role_permissions WHERE role_id=$1 AND permission_id=$2',
    [role.id, permission_id]);
  await audit(req, 'super.permission.revoke', 'role', role.id, { permission_id });
  res.json({ message: 'Permission retirée' });
}));

/* ============================= PARAMÈTRES CRITIQUES ============================= */
const CRITICAL_KEYS = new Set([
  'fees.commission_rate', 'fees.verification_enabled',
  'security.otp_enabled', 'security.session_timeout_hours',
  'platform.maintenance_mode', 'platform.name', 'country'
]);

router.get('/settings/critical', wrap(async (req, res) => {
  const rows = await db.many(`SELECT s.*, u.name AS updated_by_name FROM app_settings s
    LEFT JOIN users u ON u.id=s.updated_by
    WHERE s.key = ANY($1) ORDER BY s.key`, [Array.from(CRITICAL_KEYS)]);
  res.json({ settings: rows });
}));

router.patch('/settings/critical', requireSuperConfirm('password'), wrap(async (req, res) => {
  const entries = (req.body.entries || []).filter((e) => e && e.key && CRITICAL_KEYS.has(e.key));
  if (!entries.length) throw new HttpError(400, 'Aucun paramètre critique valide fourni');
  for (const e of entries) {
    await db.query(`INSERT INTO app_settings (key, value, type, updated_by) VALUES ($1,$2,$3,$4)
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, type=EXCLUDED.type,
        updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [e.key, String(e.value ?? ''), e.type || 'text', req.user.sub]);
  }
  await audit(req, 'super.settings.update', 'setting', null, { keys: entries.map((e) => e.key) });
  res.json({ message: `${entries.length} paramètre(s) critique(s) mis à jour` });
}));

/* ============================= PAYS ============================= */
router.get('/countries', wrap(async (req, res) => {
  const countries = await db.many(`SELECT c.*, cur.name AS currency_name, cur.symbol AS currency_symbol,
    (SELECT COUNT(*) FROM regions r WHERE r.country_code=c.code)::int AS regions_count,
    (SELECT COUNT(*) FROM cities ci WHERE ci.country_code=c.code)::int AS cities_count
    FROM countries c JOIN currencies cur ON cur.code=c.currency_code
    ORDER BY c.sort_order, c.code`);
  const currencies = await db.many('SELECT code, name, symbol FROM currencies ORDER BY code');
  res.json({ countries, currencies });
}));

router.post('/countries', requireSuperConfirm('password'), wrap(async (req, res) => {
  const { code, name, name_fr, region, phone_code, currency_code, default_locale, is_active, sort_order } = req.body || {};
  if (!code || !name || !region || !currency_code) throw new HttpError(400, 'code, name, region, currency_code requis');
  const cur = await db.one('SELECT code FROM currencies WHERE code=$1', [currency_code]);
  if (!cur) throw new HttpError(404, 'Devise inconnue');
  const c = await db.one(`INSERT INTO countries (code, name, name_fr, region, phone_code, currency_code, default_locale, is_active, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [code.trim().toUpperCase(), name.trim(), name_fr || name.trim(), region.trim(), phone_code || '',
     currency_code, default_locale || 'fr', is_active !== false, sort_order || 100]);
  await audit(req, 'super.country.create', 'country', c.code, { name: c.name });
  res.status(201).json({ country: c });
}));

router.patch('/countries/:code', requireSuperConfirm('password'), wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM countries WHERE code=$1', [req.params.code.toUpperCase()]);
  if (!cur) throw new HttpError(404, 'Pays introuvable');
  const sets = []; const params = []; let i = 1;
  if (req.body.name) { sets.push(`name=$${i++}`); params.push(req.body.name.trim()); }
  if (req.body.name_fr) { sets.push(`name_fr=$${i++}`); params.push(req.body.name_fr.trim()); }
  if (req.body.region) { sets.push(`region=$${i++}`); params.push(req.body.region.trim()); }
  if (req.body.phone_code !== undefined) { sets.push(`phone_code=$${i++}`); params.push(req.body.phone_code || ''); }
  if (req.body.currency_code) { sets.push(`currency_code=$${i++}`); params.push(req.body.currency_code); }
  if (req.body.default_locale) { sets.push(`default_locale=$${i++}`); params.push(req.body.default_locale); }
  if (typeof req.body.is_active === 'boolean') { sets.push(`is_active=$${i++}`); params.push(req.body.is_active); }
  if (typeof req.body.sort_order === 'number') { sets.push(`sort_order=$${i++}`); params.push(req.body.sort_order); }
  if (!sets.length) throw new HttpError(400, 'Aucune modification');
  params.push(req.params.code.toUpperCase());
  const updated = await db.one(`UPDATE countries SET ${sets.join(', ')} WHERE code=$${i} RETURNING *`, params);
  await audit(req, 'super.country.update', 'country', updated.code, req.body);
  res.json({ country: updated });
}));

router.post('/countries/:code/disable', requireSuperConfirm('password'), wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM countries WHERE code=$1', [req.params.code.toUpperCase()]);
  if (!cur) throw new HttpError(404, 'Pays introuvable');
  if (cur.code === (await db.one("SELECT value FROM app_settings WHERE key='country'").catch(() => ({ value: 'BJ' }))).value) {
    throw new HttpError(400, 'Impossible de désactiver le pays par défaut');
  }
  const updated = await db.one('UPDATE countries SET is_active=false WHERE code=$1 RETURNING code, is_active', [cur.code]);
  await audit(req, 'super.country.disable', 'country', updated.code, {});
  res.json({ country: updated });
}));

/* ============================= DEVISES ============================= */
router.get('/currencies', wrap(async (req, res) => {
  const rows = await db.many(`SELECT c.*,
    (SELECT COUNT(*) FROM countries co WHERE co.currency_code=c.code)::int AS countries_count
    FROM currencies c ORDER BY c.code`);
  res.json({ currencies: rows });
}));

router.post('/currencies', requireSuperConfirm('password'), wrap(async (req, res) => {
  const { code, name, symbol, decimals, iso_number, is_active } = req.body || {};
  if (!code || !name || !symbol) throw new HttpError(400, 'code, name, symbol requis');
  const c = await db.one(`INSERT INTO currencies (code, name, symbol, decimals, iso_number, is_active)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code.trim().toUpperCase(), name.trim(), symbol.trim(), Number(decimals) || 0, iso_number || '', is_active !== false]);
  await audit(req, 'super.currency.create', 'currency', c.code, { name: c.name });
  res.status(201).json({ currency: c });
}));

router.patch('/currencies/:code', requireSuperConfirm('password'), wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM currencies WHERE code=$1', [req.params.code.toUpperCase()]);
  if (!cur) throw new HttpError(404, 'Devise introuvable');
  const sets = []; const params = []; let i = 1;
  if (req.body.name) { sets.push(`name=$${i++}`); params.push(req.body.name.trim()); }
  if (req.body.symbol) { sets.push(`symbol=$${i++}`); params.push(req.body.symbol.trim()); }
  if (typeof req.body.decimals === 'number') { sets.push(`decimals=$${i++}`); params.push(req.body.decimals); }
  if (req.body.iso_number !== undefined) { sets.push(`iso_number=$${i++}`); params.push(req.body.iso_number || ''); }
  if (typeof req.body.is_active === 'boolean') { sets.push(`is_active=$${i++}`); params.push(req.body.is_active); }
  if (!sets.length) throw new HttpError(400, 'Aucune modification');
  params.push(req.params.code.toUpperCase());
  const updated = await db.one(`UPDATE currencies SET ${sets.join(', ')} WHERE code=$${i} RETURNING *`, params);
  await audit(req, 'super.currency.update', 'currency', updated.code, req.body);
  res.json({ currency: updated });
}));

/* ============================= INTÉGRATIONS ============================= */
router.get('/integrations', wrap(async (req, res) => {
  const rows = await db.many('SELECT * FROM integrations ORDER BY type, code');
  res.json({ integrations: rows });
}));

router.post('/integrations', requireSuperConfirm('password'), wrap(async (req, res) => {
  const { code, name, type, config, is_active } = req.body || {};
  if (!code || !name || !type) throw new HttpError(400, 'code, name, type requis');
  const dup = await db.one('SELECT id FROM integrations WHERE code=$1', [code.trim()]);
  if (dup) throw new HttpError(409, 'Cette intégration existe déjà');
  const integ = await db.one(`INSERT INTO integrations (code, name, type, config, is_active, created_by)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code.trim(), name.trim(), type, config || {}, is_active === true, req.user.sub]);
  await audit(req, 'super.integration.create', 'integration', integ.id, { code: integ.code });
  res.status(201).json({ integration: integ });
}));

router.patch('/integrations/:code', requireSuperConfirm('password'), wrap(async (req, res) => {
  const cur = await db.one('SELECT * FROM integrations WHERE code=$1', [req.params.code]);
  if (!cur) throw new HttpError(404, 'Intégration introuvable');
  const sets = []; const params = []; let i = 1;
  if (req.body.name) { sets.push(`name=$${i++}`); params.push(req.body.name.trim()); }
  if (req.body.type) { sets.push(`type=$${i++}`); params.push(req.body.type); }
  if (req.body.config && typeof req.body.config === 'object') { sets.push(`config=$${i++}`); params.push(req.body.config); }
  if (typeof req.body.is_active === 'boolean') { sets.push(`is_active=$${i++}`); params.push(req.body.is_active); }
  sets.push('updated_at=now()');
  params.push(req.params.code);
  const updated = await db.one(`UPDATE integrations SET ${sets.join(', ')} WHERE code=$${i} RETURNING *`, params);
  await audit(req, 'super.integration.update', 'integration', updated.id, { code: updated.code, is_active: updated.is_active });
  res.json({ integration: updated });
}));

// Suppression d'une intégration. POST (le body de confirmation est requis et
// certains reverse-proxies suppriment le body des requêtes DELETE).
router.post('/integrations/:code/remove', requireSuperConfirm('password'), wrap(async (req, res) => {
  const cur = await db.one('SELECT id FROM integrations WHERE code=$1', [req.params.code]);
  if (!cur) throw new HttpError(404, 'Intégration introuvable');
  await db.query('DELETE FROM integrations WHERE id=$1', [cur.id]);
  await audit(req, 'super.integration.delete', 'integration', cur.id, { code: req.params.code });
  res.json({ message: 'Intégration supprimée' });
}));

/* ============================= AUDIT ============================= */
router.get('/audit', wrap(async (req, res) => {
  const { entity, action, actor_email, from, to, limit = 200 } = req.query;
  const conds = []; const params = [];
  // La colonne 'after' est réservée (mot-clé SQL). On cite entre guillemets.
  if (entity) { params.push(entity); conds.push(`a.entity=$${params.length}`); }
  if (action) { params.push(`%${action}%`); conds.push(`a.action ILIKE $${params.length}`); }
  if (actor_email) { params.push(`%${actor_email}%`); conds.push(`u.email ILIKE $${params.length}`); }
  if (from) { params.push(from); conds.push(`a.created_at >= $${params.length}`); }
  if (to) { params.push(to); conds.push(`a.created_at <= $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000);
  const rows = await db.many(`SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.ip,
    a.created_at, a."before", a."after",
    u.id AS actor_id, u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    ${where} ORDER BY a.created_at DESC LIMIT ${safeLimit}`, params);
  const summary = await db.one(`SELECT COUNT(*)::int AS total,
    COUNT(DISTINCT a.action)::int AS distinct_actions,
    COUNT(*) FILTER (WHERE a.created_at > now() - interval '24 hours')::int AS last_24h
    FROM audit_logs a ${where}`, params).catch(() => ({ total: 0, distinct_actions: 0, last_24h: 0 }));
  res.json({ logs: rows, summary });
}));

module.exports = router;
