const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = ['OEM', 'PREMIUM', 'ALTERNATIVE'];
const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PART_STATUSES = ['DRAFT', 'PENDING', 'ACTIVE', 'REJECTED'];

const partSchema = z.object({
  reference: z.string().min(2).max(64),
  name: z.string().min(2).max(200),
  brand: z.string().max(100).optional().default(''),
  category: z.enum(CATEGORIES).optional().default('ALTERNATIVE'),
  description: z.string().max(2000).optional().default(''),
  unit_price_cents: z.number().int().min(0).optional().default(0),
  stock_quantity: z.number().int().min(0).optional().default(0),
  min_stock: z.number().int().min(0).optional().default(0),
  supplier_id: z.string().uuid().nullable().optional(),
  vin: z.string().max(20).optional().nullable(),
  image_doc_id: z.string().uuid().nullable().optional(),
  active: z.boolean().optional().default(true),
  status: z.enum(PART_STATUSES).optional().default('DRAFT'),
});

const compSchema = z.object({
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  year_from: z.number().int().min(1950).max(2100),
  year_to: z.number().int().min(1950).max(2100),
  engine: z.string().max(80).optional().default(''),
  fuel_type: z.string().max(20).optional().default(''),
});

const orderSchema = z.object({
  part_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  vehicle_id: z.string().uuid().nullable().optional(),
  address: z.string().max(500).optional().default(''),
  notes: z.string().max(1000).optional().default(''),
});

const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

async function assertPartOwner(partId, userId) {
  const part = await db.one('SELECT supplier_id FROM parts WHERE id=$1', [partId]);
  if (!part || !part.supplier_id) return false;
  const sup = await db.one('SELECT id FROM suppliers WHERE id=$1 AND user_id=$2', [part.supplier_id, userId]);
  return !!sup;
}

async function assertImageDoc(docId, userId) {
  const doc = await db.one('SELECT owner_id, visibility FROM document_storage WHERE id=$1', [docId]).catch(() => null);
  if (!doc) return false;
  return doc.owner_id === userId || doc.visibility === 'public';
}

router.get('/', wrap(async (req, res) => {
  const { q, category, supplier_id, vehicle_id, vin, in_stock, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ['p.status = \'ACTIVE\''];
  const params = [];
  let idx = 1;

  if (q) {
    conditions.push(`(p.reference ILIKE $${idx} OR p.name ILIKE $${idx} OR p.brand ILIKE $${idx})`);
    params.push(`%${q}%`);
    idx++;
  }
  if (category) {
    conditions.push(`p.category = $${idx}`);
    params.push(category);
    idx++;
  }
  if (supplier_id) {
    conditions.push(`p.supplier_id = $${idx}`);
    params.push(supplier_id);
    idx++;
  }
  if (in_stock === 'true') {
    conditions.push('p.stock_quantity > 0');
  }

  if (vehicle_id || vin) {
    let vehicle = null;
    if (vehicle_id) vehicle = await db.one('SELECT * FROM vehicles WHERE id=$1', [vehicle_id]);
    else vehicle = await db.one('SELECT * FROM vehicles WHERE vin ILIKE $1 LIMIT 1', [`%${vin}%`]);
    if (vehicle) {
      params.push(vehicle.make, vehicle.model, vehicle.year, vehicle.year, vehicle.vin);
      conditions.push(
        `(
          p.vin = $${idx + 4}
          OR EXISTS (
            SELECT 1 FROM part_compatibility pc
            WHERE pc.part_id = p.id
              AND pc.make = $${idx}
              AND pc.model = $${idx + 1}
              AND $${idx + 2} BETWEEN pc.year_from AND pc.year_to
              AND (pc.engine = '' OR pc.engine = $${idx + 3})
          )
        )`
      );
    }
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const rows = await db.many(
    `SELECT p.*, s.name AS supplier_name
     FROM parts p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     ${where}
     ORDER BY p.name ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limitNum, offset]
  );
  const countRow = await db.one(
    `SELECT COUNT(*)::int AS total FROM parts p ${where}`,
    params
  );
  res.json({ parts: rows, total: countRow.total, page: pageNum, limit: limitNum });
}));

router.get('/orders', wrap(async (req, res) => {
  const isSupplier = req.user.role === 'SUPPLIER';
  if (isSupplier) {
    const sup = await db.one('SELECT id FROM suppliers WHERE user_id=$1', [req.user.sub]);
    if (!sup) return res.json({ orders: [] });
    const orders = await db.many(
      `SELECT po.*, s.name AS supplier_name, v.make, v.model, v.plate, u.name AS client_name
       FROM part_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN vehicles v ON v.id = po.vehicle_id
       LEFT JOIN users u ON u.id = po.user_id
       WHERE po.supplier_id = $1
       ORDER BY po.created_at DESC`,
      [sup.id]
    );
    return res.json({ orders });
  }
  const orders = await db.many(
    `SELECT po.*, s.name AS supplier_name, v.make, v.model, v.plate
     FROM part_orders po
     LEFT JOIN suppliers s ON s.id = po.supplier_id
     LEFT JOIN vehicles v ON v.id = po.vehicle_id
     WHERE po.user_id = $1
     ORDER BY po.created_at DESC`,
    [req.user.sub]
  );
  res.json({ orders });
}));

router.post('/orders', wrap(async (req, res) => {
  const data = orderSchema.parse(req.body);
  const part = await db.one(
    'SELECT * FROM parts WHERE id=$1',
    [data.part_id]
  );
  if (!part) throw new HttpError(404, 'Pièce introuvable');
  if (!part || part.status !== 'ACTIVE' || part.stock_quantity < data.quantity) {
    throw new HttpError(409, 'Stock insuffisant pour cette pièce');
  }
  if (data.vehicle_id) {
    const v = await db.one('SELECT id FROM vehicles WHERE id=$1 AND owner_id=$2', [data.vehicle_id, req.user.sub]);
    if (!v) throw new HttpError(404, 'Véhicule introuvable');
  }
  const total = part.unit_price_cents * data.quantity;
  const order = await db.one(
    `INSERT INTO part_orders
      (user_id, supplier_id, part_id, part_reference, part_name, quantity, unit_price_cents, total_cents, vehicle_id, address, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [req.user.sub, part.supplier_id, part.id, part.reference, part.name, data.quantity, part.unit_price_cents, total, data.vehicle_id || null, data.address, data.notes]
  );
  await db.query(
    `INSERT INTO notifications (user_id, message, dedupe_key)
     SELECT user_id, 'Nouvelle commande de pièce : ' || $2 || ' x' || $3 || ' (' || $4 || ')', 'part_order:' || $1
     FROM suppliers WHERE id = $5 AND user_id IS NOT NULL
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [order.id, part.name, data.quantity, part.reference, part.supplier_id]
  );
  res.status(201).json({ order });
}));

router.patch('/orders/:id/status', requireRole('SUPPLIER', 'ADMIN'), wrap(async (req, res) => {
  const { status } = orderStatusSchema.parse(req.body);
  const order = await db.one('SELECT * FROM part_orders WHERE id=$1', [req.params.id]);
  if (!order) throw new HttpError(404, 'Commande introuvable');
  if (req.user.role !== 'ADMIN') {
    const sup = await db.one('SELECT id FROM suppliers WHERE id=$1 AND user_id=$2', [order.supplier_id, req.user.sub]);
    if (!sup) throw new HttpError(403, 'Accès refusé');
  }
  const updated = await db.one(
    `UPDATE part_orders SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`,
    [order.id, status]
  );
  await db.query(
    `INSERT INTO notifications (user_id, message, dedupe_key)
     VALUES ($1, 'Commande de pièce ' || $2 || ' : ' || $3 || '.', 'part_order:' || $4 || ':client')
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [order.user_id, order.part_reference, status, order.id]
  );
  res.json({ order: updated });
}));

router.get('/:id', wrap(async (req, res) => {
  const part = await db.one(
    `SELECT p.*, s.name AS supplier_name, s.rating AS supplier_rating
     FROM parts p LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE p.id=$1`,
    [req.params.id]
  );
  if (!part) throw new HttpError(404, 'Pièce introuvable');
  const compatibility = await db.many(
    'SELECT * FROM part_compatibility WHERE part_id=$1 ORDER BY make, model',
    [part.id]
  );
  res.json({ part, compatibility });
}));

router.get('/:id/compatibility', wrap(async (req, res) => {
  const compatibility = await db.many(
    'SELECT * FROM part_compatibility WHERE part_id=$1 ORDER BY make, model',
    [req.params.id]
  );
  res.json({ compatibility });
}));

router.post('/', requireRole('SUPPLIER', 'ADMIN'), wrap(async (req, res) => {
  const data = partSchema.parse(req.body);
  let supplierId = data.supplier_id || null;
  if (req.user.role === 'SUPPLIER') {
    const sup = await db.one('SELECT id FROM suppliers WHERE user_id=$1', [req.user.sub]);
    if (!sup) throw new HttpError(404, 'Créez d\'abord votre profil fournisseur');
    supplierId = sup.id;
  }
  let imageDocId = data.image_doc_id || null;
  if (imageDocId && !(await assertImageDoc(imageDocId, req.user.sub))) {
    throw new HttpError(400, 'Image de pièce invalide');
  }
  const status = data.status || 'DRAFT';
  const isActive = status === 'ACTIVE';
  const synthesis = {
    reference: data.reference.trim().toUpperCase(), name: data.name.trim(),
    brand: data.brand, category: data.category, description: data.description,
    unit_price_cents: data.unit_price_cents, stock_quantity: data.stock_quantity,
    has_image: !!imageDocId, created_at: new Date().toISOString()
  };
  const part = await db.one(
    `INSERT INTO parts
      (reference, name, brand, category, description, unit_price_cents, stock_quantity, min_stock, supplier_id, vin, image_doc_id, active, status, synthesis)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [data.reference.trim().toUpperCase(), data.name.trim(), data.brand, data.category, data.description, data.unit_price_cents, data.stock_quantity, data.min_stock, supplierId, data.vin || null, imageDocId, isActive, status, JSON.stringify(synthesis)]
  );
  res.status(201).json({ part });
}));

router.patch('/:id', wrap(async (req, res) => {
  const part = await db.one('SELECT * FROM parts WHERE id=$1', [req.params.id]);
  if (!part) throw new HttpError(404, 'Pièce introuvable');
  if (req.user.role !== 'ADMIN' && !(await assertPartOwner(part.id, req.user.sub))) {
    throw new HttpError(403, 'Accès refusé');
  }
  const data = partSchema.partial().parse(req.body);
  if (data.image_doc_id && !(await assertImageDoc(data.image_doc_id, req.user.sub))) {
    throw new HttpError(400, 'Image de pièce invalide');
  }
  const allowed = ['name', 'brand', 'category', 'description', 'unit_price_cents', 'stock_quantity', 'min_stock', 'vin', 'image_doc_id', 'active', 'status'];
  const sets = [];
  const params = [part.id];
  let idx = 2;
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(data[key]);
      idx++;
    }
  }
  if (data.status) {
    sets.push(`active = $${idx}`);
    params.push(data.status === 'ACTIVE');
    idx++;
  }
  if (!sets.length) return res.json({ part });
  sets.push('updated_at = now()');
  const synthesis = {
    reference: part.reference, name: data.name || part.name,
    brand: data.brand || part.brand, category: data.category || part.category,
    description: data.description || part.description,
    unit_price_cents: data.unit_price_cents || part.unit_price_cents,
    stock_quantity: data.stock_quantity !== undefined ? data.stock_quantity : part.stock_quantity,
    has_image: !!(data.image_doc_id || part.image_doc_id),
    status: data.status || part.status, updated_at: new Date().toISOString()
  };
  sets.push(`synthesis = $${idx}`); params.push(JSON.stringify(synthesis)); idx++;
  const updated = await db.one(
    `UPDATE parts SET ${sets.join(', ')} WHERE id=$1 RETURNING *`,
    params
  );
  res.json({ part: updated });
}));

router.delete('/:id', wrap(async (req, res) => {
  const part = await db.one('SELECT * FROM parts WHERE id=$1', [req.params.id]);
  if (!part) throw new HttpError(404, 'Pièce introuvable');
  if (req.user.role !== 'ADMIN' && !(await assertPartOwner(part.id, req.user.sub))) {
    throw new HttpError(403, 'Accès refusé');
  }
  await db.query('DELETE FROM parts WHERE id=$1', [part.id]);
  res.json({ ok: true });
}));

router.post('/:id/compatibility', wrap(async (req, res) => {
  const part = await db.one('SELECT * FROM parts WHERE id=$1', [req.params.id]);
  if (!part) throw new HttpError(404, 'Pièce introuvable');
  if (req.user.role !== 'ADMIN' && !(await assertPartOwner(part.id, req.user.sub))) {
    throw new HttpError(403, 'Accès refusé');
  }
  const data = compSchema.parse(req.body);
  const dup = await db.one(
    'SELECT id FROM part_compatibility WHERE part_id=$1 AND make=$2 AND model=$3 AND year_from=$4 AND year_to=$5 LIMIT 1',
    [part.id, data.make.trim(), data.model.trim(), data.year_from, data.year_to]
  );
  if (dup) throw new HttpError(409, 'Cette compatibilité existe déjà');
  if (data.year_from > data.year_to) throw new HttpError(400, 'Année de début > année de fin');
  const comp = await db.one(
    `INSERT INTO part_compatibility (part_id, make, model, year_from, year_to, engine, fuel_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [part.id, data.make.trim(), data.model.trim(), data.year_from, data.year_to, data.engine, data.fuel_type]
  );
  res.status(201).json({ compatibility: comp });
}));

router.delete('/:id/compatibility/:compId', wrap(async (req, res) => {
  const part = await db.one('SELECT * FROM parts WHERE id=$1', [req.params.id]);
  if (!part) throw new HttpError(404, 'Pièce introuvable');
  if (req.user.role !== 'ADMIN' && !(await assertPartOwner(part.id, req.user.sub))) {
    throw new HttpError(403, 'Accès refusé');
  }
  await db.query('DELETE FROM part_compatibility WHERE id=$1 AND part_id=$2', [req.params.compId, part.id]);
  res.json({ ok: true });
}));

module.exports = router;