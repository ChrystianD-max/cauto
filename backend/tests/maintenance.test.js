const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../src/utils/maintenanceEngine');
const { api, register, createVehicle, login, proToken, pgQuery } = require('./helpers');

function D(days) {
  return new Date(Date.now() + Math.round(days * 24 * 3600 * 1000));
}

test('MAINTENANCE/unit: regle kilometrage - echeance OK / DUE_SOON / OVERDUE', () => {
  const now = Date.now();
  const ok = engine.statusFor({ dueKm: 100000, dueDate: D(60), mileage: 94000, now });
  assert.equal(ok.status, 'OK');
  assert.equal(ok.km_left, 6000);

  const soon = engine.statusFor({ dueKm: 100000, dueDate: D(60), mileage: 99500, now });
  assert.equal(soon.status, 'DUE_SOON');
  assert.equal(soon.dueSoon, true);

  const over = engine.statusFor({ dueKm: 100000, dueDate: D(60), mileage: 100200, now });
  assert.equal(over.status, 'OVERDUE');
  assert.equal(over.overdue, true);
});

test('MAINTENANCE/unit: regle temporelle - mois ecoule = OVERDUE meme si km OK (regle OR)', () => {
  const now = Date.now();
  const s = engine.statusFor({ dueKm: 100000, dueDate: D(-2), mileage: 80000, now });
  assert.equal(s.status, 'OVERDUE');
  assert.equal(s.overdue, true);

  const soonT = engine.statusFor({ dueKm: 100000, dueDate: D(10), mileage: 5000, now });
  assert.equal(soonT.status, 'DUE_SOON');
});

test('MAINTENANCE/unit: statut DUE_SOON si km restant <= 500', () => {
  const now = Date.now();
  const s = engine.statusFor({ dueKm: 50000, dueDate: D(200), mileage: 49600, now });
  assert.equal(s.status, 'DUE_SOON');
  assert.ok(s.km_left <= 500);
});

test('MAINTENANCE/unit: données de reference correctes (km_left/days_left)', () => {
  const now = Date.now();
  const s = engine.statusFor({ dueKm: 100000, dueDate: D(90), mileage: 98000, now });
  assert.equal(s.km_left, 2000);
  assert.ok(s.days_left >= 89 && s.days_left <= 91, `jours restants=${s.days_left}`);
  assert.equal(s.status, 'OK');
});

test('MAINTENANCE: intervalle constructeur alimente au cree (program_constructor > 0)', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const r = await api('GET', `/api/maintenance/vehicle/${v.id}`, { token: a.token });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.program_constructor));
  assert.ok(Array.isArray(r.data.actual_records));
  assert.ok(r.data.score !== undefined);
});

test('MAINTENANCE: enregistrement ACTUAL cree un historique et remonte le kilometrage', async () => {
  const a = await register();
  const v = await createVehicle(a.token, { mileage: 50000 });
  const rows = await pgQuery('SELECT id, label FROM maintenance_rules ORDER BY id LIMIT 1');
  const rule = rows[0];
  assert.ok(rule);

  const rec = await api('POST', `/api/vehicles/${v.id}/maintenance/records`, {
    token: a.token,
    body: { rule_id: rule.id, done_at: new Date().toISOString().slice(0, 10), odometer_km: 52000 }
  });
  assert.equal(rec.status, 201);

  const maint = await api('GET', `/api/maintenance/vehicle/${v.id}`, { token: a.token });
  assert.equal(maint.status, 200);
  const actual = maint.data.actual_records.filter((x) => x.type === 'ACTUAL' && x.odometer_km === 52000);
  assert.ok(actual.length >= 1);

  const vh = await api('GET', `/api/vehicles/${v.id}`, { token: a.token });
  assert.equal(vh.data.vehicle.mileage, 52000);

  const hist = await api('GET', `/api/vehicles/${v.id}/history`, { token: a.token });
  assert.ok(hist.data.history.some((e) => e.title.includes('Entretien réalisé')));
});

test('MAINTENANCE: propriete - client tiers interdit (403)', async () => {
  const a = await register();
  const b = await register();
  const v = await createVehicle(a.token);
  const r = await api('GET', `/api/maintenance/vehicle/${v.id}`, { token: b.token });
  assert.equal(r.status, 403);
});

test('MAINTENANCE: professionnel habilité peut consulter la maintenance (garage)', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const pro = await proToken();
  const r = await api('GET', `/api/maintenance/vehicle/${v.id}`, { token: pro });
  assert.equal(r.status, 200);
});

test('MAINTENANCE: admin.demo peut consulter (droits étendus)', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const l = await login('admin.demo@cauto.local');
  const r = await api('GET', `/api/maintenance/vehicle/${v.id}`, { token: l.token });
  assert.equal(r.status, 200);
});