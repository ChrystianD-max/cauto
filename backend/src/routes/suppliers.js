const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

const supplierSchema = z.object({
  name: z.string().min(2).max(120),
  contact_name: z.string().max(120).optional().default(''),
  email: z.string().email().optional().default(''),
  phone: z.string().max(30).optional().default(''),
  address: z.string().max(300).optional().default(''),
  description: z.string().max(1500).optional().default(''),
});

const inventorySchema = z.object({
  stock_quantity: z.number().int().min(0).optional(),
  min_stock: z.number().int().min(0).optional(),
  unit_price_cents: z.number().int().min(0).optional(),
});

async function mySupplier(userId) {
  return db.one('SELECT * FROM suppliers WHERE user_id=$1', [userId]);
}

router.get('/', wrap(async (req, res) => {
  const { q, active } = req.query;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (q) {
    conditions.push(`(name ILIKE $${idx} OR contact_name ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }
  if (active === 'true') {
    conditions.push('is_active = TRUE');
  }
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const suppliers = await db.many(
    `SELECT s.*, COUNT(p.id)::int AS parts_count
     FROM suppliers s
     LEFT JOIN parts p ON p.supplier_id = s.id AND p.status = 'ACTIVE'
     ${where}
     GROUP BY s.id
     ORDER BY s.name ASC`
  );
  res.json({ suppliers });
}));

router.get('/mine', requireRole('SUPPLIER'), wrap(async (req, res) => {
  const supplier = await mySupplier(req.user.sub);
  if (!supplier) return res.json({ supplier: null });
  const stats = await db.one(
    `SELECT COUNT(*)::int AS products,
            COUNT(*) FILTER (WHERE stock_quantity <= min_stock)::int AS low_stock
     FROM parts WHERE supplier_id=$1`,
    [supplier.id]
  );
  const orders = await db.one(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status='PENDING')::int AS pending
     FROM part_orders WHERE supplier_id=$1`,
    [supplier.id]
  );
  res.json({ supplier, stats, orders });
}));

router.get('/:id', requireAuth, wrap(async (req, res) => {
  const supplier = await db.one('SELECT * FROM suppliers WHERE id=$1', [req.params.id]);
  if (!supplier) throw new HttpError(404, 'Fournisseur introuvable');
  const isOwner = req.user && req.user.role === 'SUPPLIER' && supplier.user_id === req.user.sub;
  const parts = isOwner
    ? await db.many('SELECT * FROM parts WHERE supplier_id=$1 ORDER BY name ASC', [supplier.id])
    : await db.many('SELECT * FROM parts WHERE supplier_id=$1 AND status=\'ACTIVE\' ORDER BY name ASC', [supplier.id]);
  res.json({ supplier, parts });
}));

router.post('/', requireRole('SUPPLIER', 'ADMIN'), wrap(async (req, res) => {
  const data = supplierSchema.parse(req.body);
  if (req.user.role === 'SUPPLIER') {
    const existing = await db.one('SELECT id FROM suppliers WHERE user_id=$1', [req.user.sub]);
    if (existing) throw new HttpError(409, 'Profil fournisseur déjà créé');
  }
  const supplier = await db.one(
    `INSERT INTO suppliers (name, user_id, contact_name, email, phone, address, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [data.name.trim(), req.user.role === 'SUPPLIER' ? req.user.sub : null, data.contact_name, data.email, data.phone, data.address, data.description]
  );
  res.status(201).json({ supplier });
}));

router.patch('/mine', requireRole('SUPPLIER'), wrap(async (req, res) => {
  const supplier = await mySupplier(req.user.sub);
  if (!supplier) throw new HttpError(404, 'Créez d\'abord votre profil fournisseur');
  const data = supplierSchema.partial().parse(req.body);
  const allowed = ['name', 'contact_name', 'email', 'phone', 'address', 'description'];
  const sets = [];
  const params = [supplier.id];
  let idx = 2;
  let changed = false;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(data[key]);
      idx++; changed = true;
    }
  }
  const is_active = req.body.is_active;
  if (typeof is_active === 'boolean') {
    sets.push(`is_active = $${idx}`);
    params.push(is_active); changed = true;
  }
  const attestations = req.body.attestation_doc_ids;
  if (Array.isArray(attestations)) {
    if (attestations.length > 12) throw new HttpError(400, 'Maximum 12 attestations');
    sets.push(`attestation_doc_ids = $${idx}`, `verification_status = 'PENDING'`, `verified = false`);
    params.push(JSON.stringify(attestations)); idx++; changed = true;
  }
  if (changed && !sets.includes("verification_status = 'PENDING'")) {
    sets.push(`verification_status = 'PENDING'`, `verified = false`);
  }
  if (changed) {
    const s = {
      name: data.name || supplier.name, contact_name: data.contact_name || supplier.contact_name,
      email: data.email || supplier.email, phone: data.phone || supplier.phone,
      address: data.address || supplier.address, description: data.description || supplier.description,
      attestation_count: Array.isArray(attestations) ? attestations.length : (supplier.attestation_doc_ids || []).length,
      updated_at: new Date().toISOString()
    };
    sets.push(`synthesis = $${idx}`); params.push(JSON.stringify(s));
  }
  if (!sets.length) return res.json({ supplier });
  const updated = await db.one(`UPDATE suppliers SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, params);
  res.json({ supplier: updated });
}));

router.patch('/inventory/:partId', requireRole('SUPPLIER'), wrap(async (req, res) => {
  const supplier = await mySupplier(req.user.sub);
  if (!supplier) throw new HttpError(404, 'Profil fournisseur introuvable');
  const part = await db.one('SELECT * FROM parts WHERE id=$1 AND supplier_id=$2', [req.params.partId, supplier.id]);
  if (!part) throw new HttpError(404, 'Pièce introuvable');
  const data = inventorySchema.parse(req.body);
  const sets = [];
  const params = [part.id];
  let idx = 2;
  for (const key of ['stock_quantity', 'min_stock', 'unit_price_cents']) {
    if (data[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(data[key]);
      idx++;
    }
  }
  if (!sets.length) return res.json({ part });
  sets.push('updated_at = now()');
  const updated = await db.one(`UPDATE parts SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, params);
  res.json({ part: updated });
}));

module.exports = router;