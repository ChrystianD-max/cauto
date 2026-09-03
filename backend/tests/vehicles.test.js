const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, createVehicle } = require('./helpers');

test('VEHICLES: creation 201 + duplicate plaque/VIN 409', async () => {
  const a = await register();
  const v1 = await createVehicle(a.token);
  assert.ok(v1.id);
  assert.equal(v1.owner_id, a.user.id);
  const r = await api('POST', '/api/vehicles', {
    token: a.token,
    body: { make: 'Toyota', model: 'Yaris', year: 2020, plate: v1.plate, vin: v1.vin, mileage: 1000 }
  });
  assert.equal(r.status, 409);
});

test('VEHICLES: un autre utilisateur ne peut pas modifier ni supprimer (403)', async () => {
  const a = await register();
  const b = await register();
  const v = await createVehicle(a.token);
  const patch = await api('PATCH', `/api/vehicles/${v.id}`, { token: b.token, body: { mileage: 999 } });
  assert.equal(patch.status, 403);
  const del = await api('DELETE', `/api/vehicles/${v.id}`, { token: b.token });
  assert.equal(del.status, 403);
});

test('VEHICLES: modification ok 200 + historique cree', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const patch = await api('PATCH', `/api/vehicles/${v.id}`, { token: a.token, body: { mileage: 51111 } });
  assert.equal(patch.status, 200);
  assert.equal(patch.data.vehicle.mileage, 51111);
  const hist = await api('GET', `/api/vehicles/${v.id}/history`, { token: a.token });
  assert.equal(hist.status, 200);
  const titles = hist.data.history.map((e) => e.title);
  assert.ok(titles.some((t) => t.includes('Modification')));
  assert.ok(titles.some((t) => t.includes('Création')));
});

test('VEHICLES: suppression bloquee par l historique immuable (409), liste inchangee', async () => {
  const a = await register();
  const b = await register();
  const va = await createVehicle(a.token);
  await createVehicle(b.token);
  const listA = await api('GET', '/api/vehicles', { token: a.token });
  assert.equal(listA.status, 200);
  assert.equal(listA.data.vehicles.length, 1);
  assert.equal(listA.data.vehicles[0].id, va.id);
  const del = await api('DELETE', `/api/vehicles/${va.id}`, { token: a.token });
  assert.equal(del.status, 409);
  assert.ok(del.data.error.message.includes('immuable'));
  const listAfter = await api('GET', '/api/vehicles', { token: a.token });
  assert.equal(listAfter.data.vehicles.length, 1);
});

test('VEHICLES: vehicule inconnu 404', async () => {
  const a = await register();
  const r = await api('GET', '/api/vehicles/00000000-0000-0000-0000-000000000000', { token: a.token });
  assert.equal(r.status, 404);
});

test('VEHICLES: historique pagine (limit/offset/total), cap 100', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  for (let i = 0; i < 3; i++) {
    await api('PATCH', `/api/vehicles/${v.id}`, { token: a.token, body: { mileage: 50000 + i } });
  }
  const all = await api('GET', `/api/vehicles/${v.id}/history`, { token: a.token });
  assert.equal(all.status, 200);
  assert.ok(Array.isArray(all.data.history));
  assert.equal(all.data.history.length, 4); // création + 3 modifications
  assert.equal(all.data.total, 4);
  assert.equal(all.data.limit, 20);
  assert.equal(all.data.offset, 0);

  const page = await api('GET', `/api/vehicles/${v.id}/history?limit=2&offset=2`, { token: a.token });
  assert.equal(page.status, 200);
  assert.equal(page.data.history.length, 2);
  assert.equal(page.data.total, 4);
  assert.equal(page.data.limit, 2);
  assert.equal(page.data.offset, 2);
  assert.equal(page.data.history[0].id, all.data.history[2].id);

  const big = await api('GET', `/api/vehicles/${v.id}/history?limit=500`, { token: a.token });
  assert.equal(big.status, 200);
  assert.equal(big.data.limit, 100); // cap plafonné
  assert.equal(big.data.history.length, 4);

  const beyond = await api('GET', `/api/vehicles/${v.id}/history?limit=20&offset=200`, { token: a.token });
  assert.equal(beyond.status, 200);
  assert.equal(beyond.data.history.length, 0);
  assert.equal(beyond.data.total, 4);
});