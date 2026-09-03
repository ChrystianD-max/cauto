const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, createVehicle, createServiceRequest, proToken, myProfessionalId } = require('./helpers');

async function makeMatch(urgency) {
  const a = await register();
  const v = await createVehicle(a.token);
  const sr = await createServiceRequest(a.token, { vehicle_id: v.id, urgency });
  const m = await api('POST', `/api/service-requests/${sr.id}/match`, { token: a.token, body: {} });
  assert.equal(m.status, 200);
  return { a, v, sr, results: m.data.results || m.data.matches || [] };
}

test('MATCHING: retourne des resultats classes par score decroissant', async () => {
  const { results } = await makeMatch('NORMAL');
  assert.ok(results.length > 0, 'au moins un professionnel matche');
  const scores = results.map((r) => r.score);
  for (const s of scores) {
    assert.ok(s >= 0 && s <= 100, `score dans [0,100], obtenu ${s}`);
  }
  const sorted = [...scores].sort((x, y) => y - x);
  assert.deepEqual(scores, sorted);
  assert.ok(results[0].professional_id);
});

test('MATCHING: la marque exacte domine le classement', async () => {
  const a = await register();
  const v = await createVehicle(a.token, { make: 'Renault', model: 'Clio' });
  const sr = await createServiceRequest(a.token, { vehicle_id: v.id });
  const m = await api('POST', `/api/service-requests/${sr.id}/match`, { token: a.token, body: {} });
  assert.equal(m.status, 200);
  const results = m.data.results || m.data.matches || [];
  assert.ok(results.length > 0);
  const renault = results.filter((r) => r.brand && r.brand.toUpperCase().includes('RENAULT'));
  if (renault.length) {
    assert.equal(renault[0].score, 100);
    assert.equal(results[0].score, 100);
  }
});

test('MATCHING: la selection d un pro est acceptee puis refusee en double (400)', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const sr = await createServiceRequest(a.token, { vehicle_id: v.id });
  const pro = await proToken();
  const proId = await myProfessionalId(pro);
  await api('POST', `/api/service-requests/${sr.id}/match`, { token: a.token, body: {} });
  const sel = await api('POST', `/api/service-requests/${sr.id}/select`, {
    token: a.token, body: { professional_id: proId }
  });
  assert.equal(sel.status, 200);
  const twice = await api('POST', `/api/service-requests/${sr.id}/select`, {
    token: a.token, body: { professional_id: proId }
  });
  assert.equal(twice.status, 400);
});

test('MATCHING: urgence acceptee et n interrompt pas le matching', async () => {
  for (const u of ['URGENT', 'CRITIQUE']) {
    const { results } = await makeMatch(u);
    assert.ok(results.length > 0, `urgence ${u} renvoie des resultats`);
  }
});

test('MATCHING: profils de matching disponibles (profil standard present)', async () => {
  const a = await register();
  const r = await api('GET', '/api/matching/profiles', { token: a.token });
  assert.equal(r.status, 200);
  const profiles = r.data.profiles || r.data;
  assert.ok(Array.isArray(profiles));
  assert.ok(profiles.some((p) => p.code === 'STANDARD' || p.name === 'STANDARD'));
});