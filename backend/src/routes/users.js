const express = require('express');
const db = require('../db');
const { requireAuth, requireRole, hasPermission } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const { validate, z } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

const profilePatch = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(40).optional(),
  avatar_url: z.string().max(500).nullable().optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(120).optional(),
  country: z.string().max(2).optional()
}).passthrough();

const roleEnum = z.enum(['CLIENT', 'GARAGE', 'MECANICIEN', 'EXPERT', 'SUPPLIER', 'LIVREUR', 'FLEET_MANAGER', 'ADMIN', 'SUPER_ADMIN']);

async function loadFullProfile(userId) {
  const user = await db.one('SELECT id, name, email, phone, role, status, created_at FROM users WHERE id=$1', [userId]);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  const profile = await db.one('SELECT * FROM user_profiles WHERE user_id=$1', [userId]).catch(() => null);
  const roles = await db.many(
    'SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=$1', [userId]
  );
  const permissions = await db.many(
    `SELECT DISTINCT p.code FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id=ur.role_id
     JOIN permissions p ON p.id=rp.permission_id
     WHERE ur.user_id=$1`, [userId]
  );
  return {
    user,
    profile: profile || null,
    roles: roles.map((r) => r.code),
    permissions: permissions.map((p) => p.code)
  };
}

// GET /api/users/me — profil complet + rôles + permissions (contrôle RBAC côté serveur)
router.get('/me', wrap(async (req, res) => {
  res.json(await loadFullProfile(req.user.sub));
}));

// PATCH /api/users/me — propres coordonnées / adresse
router.patch('/me', validate(profilePatch), wrap(async (req, res) => {
  const { name, phone, avatar_url, address, city, country } = req.body;
  if (name || phone) {
    await db.query(
      `UPDATE users SET name=COALESCE($1, name), phone=COALESCE($2, phone) WHERE id=$3`,
      [name ?? null, phone ?? null, req.user.sub]
    );
  }
  await db.query(
    `INSERT INTO user_profiles (user_id, avatar_url, address, city, country)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET
       avatar_url=COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
       address=COALESCE(EXCLUDED.address, user_profiles.address),
       city=COALESCE(EXCLUDED.city, user_profiles.city),
       country=COALESCE(EXCLUDED.country, user_profiles.country),
       updated_at=NOW()`,
    [req.user.sub, avatar_url ?? null, address ?? null, city ?? null, country ?? null]
  );
  res.json(await loadFullProfile(req.user.sub));
}));

// GET /api/users/:id — soi-même ou admin
router.get('/:id', wrap(async (req, res) => {
  if (req.user.role !== 'ADMIN' && req.params.id !== String(req.user.sub)) {
    throw new HttpError(403, 'Accès refusé');
  }
  res.json(await loadFullProfile(req.params.id));
}));

// PATCH /api/users/:id — soi-même (champs simples) ; admin (rôle/statut via users.roles.assign)
router.patch('/:id', validate(profilePatch), wrap(async (req, res) => {
  const isSelf = req.params.id === String(req.user.sub);
  const isAdmin = req.user.role === 'ADMIN';
  if (!isSelf && !isAdmin) throw new HttpError(403, 'Accès refusé');
  const sets = [];
  const params = [];
  const id = req.params.id;
  let idx = 1;
  for (const f of ['name', 'phone']) {
    if (req.body[f] !== undefined) { sets.push(`${f}=$${idx++}`); params.push(req.body[f]); }
  }
  if (isAdmin) {
    if (req.body.role !== undefined) {
      const r = roleEnum.safeParse(req.body.role);
      if (!r.success) throw new HttpError(400, 'Rôle invalide', { code: 'VALIDATION_ERROR' });
      if (!(await hasPermission(req.user.sub, 'users.roles.assign'))) {
        throw new HttpError(403, 'Permission requise : users.roles.assign');
      }
      sets.push(`role=$${idx++}`);
      params.push(r.data);
    }
    if (req.body.status !== undefined) {
      sets.push(`status=$${idx++}`);
      params.push(req.body.status);
    }
  }
  if (sets.length) {
    params.push(id);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id=$${idx}`, params);
  }
  res.json(await loadFullProfile(id));
}));

module.exports = router;