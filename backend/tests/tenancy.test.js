// MODULE 75 — ARCHITECTURE MULTI-TENANT : isolation des données.
//   GARAGE : un garage ne voit pas les véhicules privés d'un autre garage.
//   ENTREPRISE : chaque tenant ENTREPRISE ne voit que sa propre flotte.
//   Détails tenants : GET /tenants/me, admin/all, ajout de membre.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, login, myProfessionalId, createVehicle, createServiceRequest, pgQuery } = require('./helpers');

const PRO = 'garage.auto@cauto.local';

// Compte FLEET_MANAGER via register : le backend crée le tenant ENTREPRISE + OWNER.
function newFleetManager(name) {
  return register({ name, role: 'FLEET_MANAGER' });
}

test('TENANT: GET /tenants/me renvoie le tenant GARAGE du garage demo', async () => {
  const loginResp = await login(PRO);
  const r = await api('GET', '/api/tenants/me', { token: loginResp.token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(Array.isArray(r.data.tenants));
  const garageT = r.data.tenants.find((t) => t.type === 'GARAGE');
  assert.ok(garageT, 'tenant GARAGE présent');
  assert.ok(garageT.id && garageT.name);
});

test('ISOLATION GARAGE: un garage N°2 ne lit pas la fiche d un véhicule tiers', async () => {
  // Garage A (demo) et Garage B (fraîchement inscrit).
  const b = await register({ name: 'Garage Isolation B', role: 'GARAGE' });
  const bToken = b.token;

  // Un client tiers possède un véhicule rattaché à A via une demande.
  const client = await register({ name: 'Client Isolé' });
  const vehicle = await createVehicle(client.token);

  // B (autre garage) tente de lire le véhicule du client : interdit.
  const attempt = await api('GET', `/api/vehicles/${vehicle.id}`, { token: bToken });
  assert.equal(attempt.status, 403, JSON.stringify(attempt.data));

  // Le propriétaire, lui, y accède.
  const owner = await api('GET', `/api/vehicles/${vehicle.id}`, { token: client.token });
  assert.equal(owner.status, 200, JSON.stringify(owner.data));
});

test('ISOLATION GARAGE: le garage auquel le client est rattaché accède au véhicule', async () => {
  const a = await login(PRO);
  const client = await register({ name: 'Client Rattache' });
  const vehicle = await createVehicle(client.token);
  const sr = await createServiceRequest(client.token, { vehicle_id: vehicle.id });
  const match = await api('POST', `/api/service-requests/${sr.id}/match`, { token: client.token, body: {} });
  assert.equal(match.status, 200, JSON.stringify(match.data));

  // Le client sélectionne le professionnel du garage A → le lien est créé.
  const proId = await myProfessionalId(a.token);
  const sel = await api('POST', `/api/service-requests/${sr.id}/select`, {
    token: client.token, body: { professional_id: proId }
  });
  assert.equal(sel.status, 200, JSON.stringify(sel.data));

  // Le pro de A est maintenant lié au véhicule via la demande assignée.
  const access = await api('GET', `/api/vehicles/${vehicle.id}`, { token: a.token });
  assert.equal(access.status, 200, JSON.stringify(access.data));

  // Un autre garage ne doit toujours pas y accéder.
  const b = await register({ name: 'Garage Isolation B2', role: 'GARAGE' });
  const blocked = await api('GET', `/api/vehicles/${vehicle.id}`, { token: b.token });
  assert.equal(blocked.status, 403, JSON.stringify(blocked.data));
});

test('DIAGNOSTIC: un garage ne lance pas de diagnostic sur un véhicule externe', async () => {
  const b = await register({ name: 'Garage Diag B', role: 'GARAGE' });
  const client = await register({ name: 'Client Diag Tiers' });
  const vehicle = await createVehicle(client.token);
  const r = await api('POST', '/api/diagnostic', {
    token: b.token,
    body: { vehicle_id: vehicle.id, category: 'BK', symptom_text: 'Grondement à l avant', urgency: 'NORMAL' }
  });
  assert.equal(r.status, 403, JSON.stringify(r.data));
});

test('TENANT ENTREPRISE: la flotte est scopée au tenant (2 comptes = 2 tenants isolés)', async () => {
  const e1 = await register({ name: 'Transport Loko', role: 'FLEET_MANAGER' });
  const e2 = await register({ name: 'BTP Sema', role: 'FLEET_MANAGER' });

  const t1 = await api('GET', '/api/tenants/me', { token: e1.token });
  assert.equal(t1.status, 200, JSON.stringify(t1.data));
  const tenant1 = t1.data.tenants.find((x) => x.type === 'ENTREPRISE');
  assert.ok(tenant1, 'entreprise 1 a un tenant ENTREPRISE');

  const v1 = await createVehicle(e1.token, { mileage: 120000 });
  const v2 = await createVehicle(e1.token, { mileage: 80000 });
  const v3 = await createVehicle(e2.token, { mileage: 60000 });

  await pgQuery('UPDATE vehicles SET tenant_id=$1 WHERE id IN ($2,$3)', [tenant1.id, v1.id, v2.id]);

  const list1 = await api('GET', '/api/vehicles', { token: e1.token });
  assert.equal(list1.status, 200, JSON.stringify(list1.data));
  const ids1 = list1.data.vehicles.map((v) => v.id);
  assert.ok(ids1.includes(v1.id) && ids1.includes(v2.id), 'flotte 1 visible');
  assert.ok(!ids1.includes(v3.id), 'flotte de l autre entreprise invisible');

  const list2 = await api('GET', '/api/vehicles', { token: e2.token });
  const ids2 = list2.data.vehicles.map((v) => v.id);
  assert.ok(ids2.includes(v3.id), 'flotte 2 visible chez e2');
  assert.ok(!ids2.includes(v1.id), 'flotte 1 invisible chez e2');
});

test('TENANT ENTREPRISE: ajout d un membre partage la flotte', async () => {
  const e1 = await register({ name: 'Transport Partage', role: 'FLEET_MANAGER' });
  const t1 = await api('GET', '/api/tenants/me', { token: e1.token });
  const tenant1 = t1.data.tenants.find((x) => x.type === 'ENTREPRISE');

  const vehicle = await createVehicle(e1.token);
  await pgQuery('UPDATE vehicles SET tenant_id=$1 WHERE id=$2', [tenant1.id, vehicle.id]);

  const member = await register({ name: 'Conducteur Djo' });
  const add = await api('POST', `/api/tenants/${tenant1.id}/members`, {
    token: e1.token, body: { user_id: member.user.id, role: 'MEMBER' }
  });
  assert.equal(add.status, 201, JSON.stringify(add.data));

  const list = await api('GET', '/api/vehicles', { token: member.token });
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.ok(list.data.vehicles.map((v) => v.id).includes(vehicle.id), 'flotte visible par le membre');
});

test('TENANT: non-membre ne voit pas le détail d un tenant entreprise', async () => {
  const e1 = await register({ name: 'Transport Privé', role: 'FLEET_MANAGER' });
  const t1 = await api('GET', '/api/tenants/me', { token: e1.token });
  const tenant1 = t1.data.tenants.find((x) => x.type === 'ENTREPRISE');

  const outsider = await register({ name: 'Curieux X' });
  const r = await api('GET', `/api/tenants/${tenant1.id}`, { token: outsider.token });
  assert.equal(r.status, 403, JSON.stringify(r.data));
});