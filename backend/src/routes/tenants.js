const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');
const tenancy = require('../utils/tenancy');

const router = express.Router();
router.use(requireAuth);

const TENANT_TYPES = ['CLIENT', 'GARAGE', 'ENTREPRISE', 'FOURNISSEUR'];
const MEMBER_ROLES = ['OWNER', 'ADMIN', 'MEMBER'];

// Mes tenants (CLIENT / GARAGE / ENTREPRISE / FOURNISSEUR) et mon rôle.
router.get('/me', wrap(async (req, res) => {
  const tenants = await tenancy.resolveTenants(req.user.sub);
  res.json({ tenants });
}));

// Liste tous les tenants (admin global uniquement). Doit précéder /:id.
router.get('/admin/all', requireRole('ADMIN'), wrap(async (req, res) => {
  const tenants = await db.many(
    `SELECT t.id, t.type, t.name, t.created_at,
            COUNT(DISTINCT tm.user_id)::int AS members_count,
            COUNT(DISTINCT v.id)::int AS vehicles_count
     FROM tenants t
     LEFT JOIN tenant_memberships tm ON tm.tenant_id = t.id
     LEFT JOIN vehicles v ON v.tenant_id = t.id
     GROUP BY t.id
     ORDER BY t.type, t.name`
  );
  res.json({ tenants });
}));

// Détail d'un tenant + membres (membre du tenant ou admin requis).
router.get('/:id', wrap(async (req, res) => {
  const tenant = await db.one('SELECT * FROM tenants WHERE id=$1', [req.params.id]);
  if (!tenant) throw new HttpError(404, 'Tenant introuvable');
  const isAdmin = req.user.role === 'ADMIN' || req.user.isSuperAdmin;
  const membership = await db.one(
    'SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',
    [tenant.id, req.user.sub]
  ).catch(() => null);
  if (!membership && !isAdmin) throw new HttpError(403, 'Accès refusé à ce tenant');

  // Stats scopées au tenant : nombre de membres et (ENTREPRISE) véhicules de flotte.
  const members = await db.many(
    `SELECT tm.user_id, tm.role, u.name, u.email, u.role AS user_role, tm.created_at
     FROM tenant_memberships tm JOIN users u ON u.id = tm.user_id
     WHERE tm.tenant_id=$1 ORDER BY tm.created_at`,
    [tenant.id]
  );
  let vehicles_count = 0;
  if (tenant.type === 'ENTREPRISE') {
    const v = await db.one('SELECT COUNT(*)::int AS n FROM vehicles WHERE tenant_id=$1', [tenant.id]);
    vehicles_count = v.n;
  }
  res.json({ tenant, members, vehicles_count });
}));

// Ajouter un membre (OWNER ou ADMIN du tenant ; ou admin global).
router.post('/:id/members', wrap(async (req, res) => {
  const tenant = await db.one('SELECT * FROM tenants WHERE id=$1', [req.params.id]);
  if (!tenant) throw new HttpError(404, 'Tenant introuvable');
  const isAdmin = req.user.role === 'ADMIN' || req.user.isSuperAdmin;
  if (!isAdmin) {
    const m = await db.one(
      'SELECT role FROM tenant_memberships WHERE tenant_id=$1 AND user_id=$2',
      [tenant.id, req.user.sub]
    ).catch(() => null);
    if (!m || !['OWNER', 'ADMIN'].includes(m.role)) {
      throw new HttpError(403, 'Réservé au propriétaire ou administrateur du tenant');
    }
  }
  const { user_id, role } = z.object({
    user_id: z.string().uuid(),
    role: z.enum(MEMBER_ROLES).optional().default('MEMBER')
  }).parse(req.body);
  const user = await db.one('SELECT id FROM users WHERE id=$1', [user_id]);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  await db.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role)
     VALUES ($1,$2,$3) ON CONFLICT (tenant_id, user_id) DO UPDATE SET role=EXCLUDED.role`,
    [tenant.id, user_id, role]
  );
  res.status(201).json({ ok: true, tenant_id: tenant.id, user_id, role });
}));

module.exports = router;