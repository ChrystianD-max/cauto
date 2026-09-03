// Modules 73 (GARANTIE) et 74 (TRAÇABILITÉ).
// - Une garantie ne se crée que sur une intervention CLOTUREE et PAYEE, et lie
//   repair_order / vehicle / professional / delais / conditions.
// - Le journal repair_trace est APPEND-ONLY : bloque la modification silencieuse.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, buildJourney, pgQuery } = require('./helpers');

test('GARANTIE: creation bloquee si intervention non cloturee', async () => {
  const { interventionId, pro } = await buildJourney({ stage: 'repairing' });
  const r = await api('POST', '/api/warranties', {
    token: pro, body: { intervention_id: interventionId, months: 12 }
  });
  assert.equal(r.status, 409, JSON.stringify(r.data));
});

test('GARANTIE: creation sans paiement refuse (409)', async () => {
  const { interventionId, pro } = await buildJourney(); // CLOSED mais paiement non effectué dans le parcours
  const r = await api('POST', '/api/warranties', {
    token: pro, body: { intervention_id: interventionId, months: 12 }
  });
  // Le parcours helper n'effectue pas de paiement : on exige le paiement.
  assert.equal(r.status, 409, JSON.stringify(r.data));
});

test('TRACE: journal append-only cree a la cloture (QUI/QUOI/QUAND/VEHICULE/KM/PIECE/PRIX)', async () => {
  const { interventionId, vehicle, pro, client } = await buildJourney();
  const rows = await pgQuery(
    `SELECT rt.id, rt.action, rt.odometer_km, rt.part_label, rt.part_reference, rt.part_qty,
            rt.unit_price_cents, rt.total_price_cents, rt.result, rt.vehicle_id, rt.intervention_id
     FROM repair_trace rt WHERE rt.intervention_id=$1 ORDER BY rt.created_at`, [interventionId]
  );
  assert.ok(Array.isArray(rows) && rows.length >= 2, 'au moins le resume + 1 piece: ' + JSON.stringify(rows));
  const summary = rows.find((r) => r.action === 'REPARATION');
  assert.ok(summary, 'entree REPARATION presente');
  assert.equal(summary.vehicle_id, vehicle.id);
  assert.equal(summary.intervention_id, interventionId);
  assert.equal(summary.odometer_km, 50100, 'kilométrage du contrôle qualité');
  assert.ok(summary.total_price_cents >= 31000, 'total rep. >= 31000');
  const part = rows.find((r) => r.action === 'REPARATION_PART');
  assert.ok(part, 'entree REPARATION_PART presente');
  assert.equal(part.part_label, 'Plaquettes avant');
  assert.equal(Number(part.part_qty), 1);
  assert.equal(part.unit_price_cents, 15000);

  // Immutabilité : aucun UPDATE/DELETE possible (silencieux ou non).
  let blocked = true;
  try {
    await pgQuery(`UPDATE repair_trace SET part_label='FALSIFIE' WHERE id=$1 RETURNING id`, [rows[0].id]);
    blocked = false;
  } catch (e) {
    assert.match(String(e.message), /immuable|append-only|forbid/i);
  }
  assert.ok(blocked, 'UPDATE de trace doit etre refusé');
});

test('TRACE: endpoint GET /repairs/:id/trace accessible au client proprietaire', async () => {
  const { interventionId, client } = await buildJourney();
  const r = await api('GET', `/api/repairs/${interventionId}/trace`, { token: client.token });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data.trace) && r.data.trace.length >= 2);
  assert.ok(r.data.trace.every((e) => e.action));
});