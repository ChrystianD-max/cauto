const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, createVehicle, buildJourney, ensureAdminRole, login } = require('./helpers');

test('SECURITE: route protegee sans token 401', async () => {
  const r = await api('GET', '/api/vehicles');
  assert.equal(r.status, 401);
});

test('SECURITE: token invalide 401', async () => {
  const r = await api('GET', '/api/vehicles', { token: 'invalide.bidon.token' });
  assert.equal(r.status, 401);
});

test('SECURITE: client sans role admin bloque sur /api/admin (403)', async () => {
  const a = await register();
  const r = await api('GET', '/api/admin/dashboard', { token: a.token });
  assert.equal(r.status, 403);
});

test('SECURITE: admin.demo accede au tableau de bord admin (200)', async () => {
  await ensureAdminRole();
  const l = await login('admin.demo@cauto.local');
  const r = await api('GET', '/api/admin/dashboard', { token: l.token });
  assert.equal(r.status, 200);
});

test('SECURITE: donnees d autrui inaccessibles (403 sur vehicule)', async () => {
  const a = await register();
  const b = await register();
  const v = await createVehicle(a.token);
  const r = await api('GET', `/api/vehicles/${v.id}`, { token: b.token });
  assert.equal(r.status, 403);
});

test('SECURITE: un client ne peut pas creer un devis (403 role)', async () => {
  const { interventionId, client } = await buildJourney({ stage: 'quote' });
  const r = await api('POST', '/api/quotes', {
    token: client.token,
    body: { intervention_id: interventionId, items: [{ label: 'X', kind: 'PARTS', qty: 1, unit_price_cents: 100 }] }
  });
  assert.equal(r.status, 403);
});

test('SECURITE: endpoint administrateur par permission (audit-logs) reserve', async () => {
  const a = await register();
  const r = await api('GET', '/api/admin/audit-logs', { token: a.token });
  assert.equal(r.status, 403);
});

test('SECURITE: intervention d un tiers inaccessible (403)', async () => {
  const { interventionId } = await buildJourney({ stage: 'quote' });
  const other = await register();
  const r = await api('GET', `/api/interventions/${interventionId}`, { token: other.token });
  assert.equal(r.status, 403);
});