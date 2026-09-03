const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, login, uniqEmail, uniqPlate, uniqVin } = require('./helpers');

const PASS = 'Test1234!';
const ADM = 'admin.demo@cauto.local';

const randName = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

async function newSupplier() {
  return register({ name: 'Fournisseur Auto', role: 'SUPPLIER' });
}

async function newClient() {
  return register({ role: 'CLIENT' });
}

async function createBoutique(token, { name } = {}) {
  const r = await api('POST', '/api/suppliers', {
    token,
    body: { name: name || randName('Pieces Auto'), contact_name: 'Dede Akue', email: uniqEmail(), phone: '+22997001010', address: 'Cotonou, zone marchande', description: 'Pieces neuves et compatibles' }
  });
  return r;
}

async function createPart(token, { name = 'Plaquette de frein', price = 4500, stock = 12, status = 'ACTIVE' } = {}) {
  const r = await api('POST', '/api/parts', {
    token,
    body: { reference: 'REF' + Date.now().toString(36).toUpperCase(), name, brand: 'BREMBO', category: 'PREMIUM', description: 'Jeu avant', unit_price_cents: price, stock_quantity: stock, min_stock: 2, status }
  });
  return r;
}

test('SUPPLIER: inscription -> boutique absente -> creation -> stats a jour', async () => {
  const s = await newSupplier();
  const none = await api('GET', '/api/suppliers/mine', { token: s.token });
  assert.equal(none.status, 200);
  assert.equal(none.data.supplier, null);

  const c = await createBoutique(s.token);
  assert.equal(c.status, 201);
  assert.ok(c.data.supplier.id);

  const mine = await api('GET', '/api/suppliers/mine', { token: s.token });
  assert.equal(mine.status, 200);
  assert.ok(mine.data.supplier.name && mine.data.supplier.name !== '');
  assert.equal(mine.data.supplier.is_active, true);
  assert.equal(mine.data.stats.products, 0);
  assert.equal(mine.data.orders.pending, 0);
});

test('SUPPLIER: seconde boutique refusee (409)', async () => {
  const s = await newSupplier();
  await createBoutique(s.token);
  const second = await createBoutique(s.token, { name: 'Autre Boutique' });
  assert.equal(second.status, 409);
});

test('SUPPLIER: referencer une piece puis maj du stock/prix (inventaire)', async () => {
  const s = await newSupplier();
  await createBoutique(s.token);
  const p = await createPart(s.token, { price: 4500, stock: 12 });
  assert.equal(p.status, 201);
  assert.equal(p.data.part.unit_price_cents, 4500);
  assert.ok(p.data.part.supplier_id);

  const inv = await api('PATCH', `/api/suppliers/inventory/${p.data.part.id}`, {
    token: s.token, body: { stock_quantity: 32, min_stock: 5, unit_price_cents: 4200 }
  });
  assert.equal(inv.status, 200);
  assert.equal(inv.data.part.stock_quantity, 32);
  assert.equal(inv.data.part.unit_price_cents, 4200);

  const mine = await api('GET', '/api/suppliers/mine', { token: s.token });
  assert.equal(mine.data.stats.products, 1);
  assert.equal(mine.data.stats.low_stock, 0);
});

test('SUPPLIER: piece brouillon masquee du catalogue public, detail + compatibilite', async () => {
  const s = await newSupplier();
  await createBoutique(s.token);
  const p = await createPart(s.token, { name: 'Tambour de frein', status: 'DRAFT' });
  const sid = p.data.part.supplier_id;

  const pub = await api('GET', '/api/parts', { token: s.token });
  assert.equal(pub.status, 200);
  assert.ok(!pub.data.parts.some((x) => x.id === p.data.part.id), 'piece brouillon absente du catalogue');

  await api('PATCH', `/api/parts/${p.data.part.id}`, { token: s.token, body: { active: true } });

  const pub2 = await api('GET', '/api/parts?supplier_id=' + sid, { token: s.token });
  assert.ok(!pub2.data.parts.some((x) => x.id === p.data.part.id));

  const detail = await api('GET', `/api/parts/${p.data.part.id}`, { token: s.token });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.compatibility, []);

  const comp = await api('POST', `/api/parts/${p.data.part.id}/compatibility`, {
    token: s.token, body: { make: 'Toyota', model: 'Corolla', year_from: 2016, year_to: 2024 }
  });
  assert.equal(comp.status, 201);

  const detail2 = await api('GET', `/api/parts/${p.data.part.id}`, { token: s.token });
  assert.equal(detail2.data.compatibility.length, 1);
  assert.equal(detail2.data.compatibility[0].make, 'Toyota');
});

test('ORDERS: client commande une piece, fournisseur traite la commande', async () => {
  const s = await newSupplier();
  await createBoutique(s.token);
  const p = await createPart(s.token, { price: 4500, stock: 20 });
  const part = p.data.part;

  const cl = await newClient();
  const v = await api('POST', '/api/vehicles', {
    token: cl.token,
    body: { make: 'Toyota', model: 'Yaris', year: 2020, plate: uniqPlate(), vin: uniqVin(), mileage: 25000, fuel_type: 'ESSENCE', gearbox: 'MANUELLE', transmission: 'TWD' }
  });
  assert.equal(v.status, 201);

  const order = await api('POST', '/api/parts/orders', {
    token: cl.token,
    body: { part_id: part.id, quantity: 2, vehicle_id: v.data.vehicle.id, address: 'Cotonou', notes: 'Urgent' }
  });
  assert.equal(order.status, 201);
  const o = order.data.order;
  assert.equal(o.total_cents, 9000);
  assert.equal(o.status, 'PENDING');

  const supOrders = await api('GET', '/api/parts/orders', { token: s.token });
  assert.equal(supOrders.status, 200);
  assert.ok(supOrders.data.orders.some((x) => x.id === o.id));

  const ship = await api('PATCH', `/api/parts/orders/${o.id}/status`, {
    token: s.token, body: { status: 'SHIPPED' }
  });
  assert.equal(ship.status, 200);
  assert.equal(ship.data.order.status, 'SHIPPED');

  const deliv = await api('PATCH', `/api/parts/orders/${o.id}/status`, {
    token: s.token, body: { status: 'DELIVERED' }
  });
  assert.equal(deliv.data.order.status, 'DELIVERED');

  const clOrders = await api('GET', '/api/parts/orders', { token: cl.token });
  assert.ok(clOrders.data.orders.find((x) => x.id === o.id).status === 'DELIVERED');
});

test('SECURITE: un CLIENT ne doit ni creer de piece ni gerer la boutique', async () => {
  const cl = await newClient();
  const part = await api('POST', '/api/parts', { token: cl.token, body: { reference: 'XX', name: 'P', unit_price_cents: 100, stock_quantity: 1 } });
  assert.equal(part.status, 403);

  const bout = await api('POST', '/api/suppliers', { token: cl.token, body: { name: 'Hack' } });
  assert.equal(bout.status, 403);

  const mine = await api('PATCH', '/api/suppliers/mine', { token: cl.token, body: { is_active: false } });
  assert.equal(mine.status, 403);
});

test('SECURITE: un autre SUPPLIER ne peut modifier/supprimer une piece etrangere', async () => {
  const s1 = await newSupplier();
  const s2 = await newSupplier();
  await createBoutique(s1.token);
  await createBoutique(s2.token);
  const p = await createPart(s1.token);
  const pid = p.data.part.id;

  const patch = await api('PATCH', `/api/parts/${pid}`, { token: s2.token, body: { stock_quantity: 999 } });
  assert.equal(patch.status, 403);

  const del = await api('DELETE', `/api/parts/${pid}`, { token: s2.token });
  assert.equal(del.status, 403);
});

test('SUPPLIER: depots d attestations -> PENDING, admin verifie -> VERIFIED', async () => {
  const s = await newSupplier();
  const bout = await createBoutique(s.token);
  const sid = bout.data.supplier.id;

  const att = await api('PATCH', '/api/suppliers/mine', {
    token: s.token, body: { attestation_doc_ids: ['00000000-0000-0000-0000-000000000001'] }
  });
  assert.equal(att.status, 200);
  assert.equal(att.data.supplier.verification_status, 'PENDING');
  assert.equal(att.data.supplier.verified, false);

  const admin = await login(ADM);
  const verif = await api('PATCH', `/api/admin/suppliers/${sid}/verify`, {
    token: admin.token, body: { verified: true }
  });
  assert.equal(verif.status, 200);
  assert.equal(verif.data.supplier.verification_status, 'VERIFIED');
  assert.equal(verif.data.supplier.verified, true);
});

test('CATALOGUE: liste publique des fournisseurs actifs avec nb de pieces', async () => {
  const s = await newSupplier();
  const bout = await createBoutique(s.token);
  assert.equal(bout.status, 201);
  const p = await createPart(s.token);
  assert.equal(p.status, 201);

  const all = await api('GET', '/api/suppliers?active=true', { token: s.token });
  assert.equal(all.status, 200);
  const found = all.data.suppliers.find((x) => x.id === bout.data.supplier.id);
  assert.ok(found, 'boutique listee');
  assert.ok(found.parts_count >= 1);

  const detail = await api('GET', `/api/suppliers/${found.id}`, { token: s.token });
  assert.equal(detail.status, 200);
  assert.ok(detail.data.parts.some((x) => x.supplier_id === found.id));
});