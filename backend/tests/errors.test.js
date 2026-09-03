'use strict';

/* Module 69 — Gestion des erreurs : toutes les réponses d'erreur API sont
   structurées { success:false, error:{ code, message } }, rétro-compatibles
   (code/message à plat), et n'exposent JAMAIS de stack trace au client. */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, createVehicle } = require('./helpers');

// Forme générique attendue pour toute erreur API (module 69).
function assertStructuredError(body, expectedStatus, expectedCode) {
  assert.equal(body.success, false, 'doit porter success:false');
  assert.ok(body.error, 'doit porter un objet error');
  assert.equal(typeof body.error.message, 'string', 'error.message doit être une string');
  assert.ok(body.error.message.length > 0, 'error.message ne doit pas être vide');
  if (expectedCode) assert.equal(body.error.code, expectedCode, 'code d erreur');
  // Rétro-compat : champs à plat présents.
  assert.equal(body.code, body.error.code, 'code à plat = code structuré');
  assert.equal(body.message, body.error.message, 'message à plat = message structuré');
}

// Aucune stack trace ne doit jamais fuiter vers le client.
function assertNoStack(body) {
  const raw = JSON.stringify(body);
  assert.ok(!/\bstack\b/i.test(raw), 'ne doit pas exposer de champ stack');
  assert.ok(!/\n\s+at\s+/.test(raw), 'ne doit pas contenir de trace "at …"');
}

test('ERRORS: 401 sans token → structuré, sans stack', async () => {
  const r = await api('GET', '/api/vehicles');
  assert.equal(r.status, 401);
  assertStructuredError(r.data, 401, 'UNAUTHORIZED');
  assertNoStack(r.data);
});

test('ERRORS: 404 route inconnue → NOT_FOUND structuré', async () => {
  const a = await register();
  const r = await api('GET', '/api/inexistante-xyz', { token: a.token });
  assert.equal(r.status, 404);
  assertStructuredError(r.data, 404, 'NOT_FOUND');
  assertNoStack(r.data);
});

test('ERRORS: véhicule inexistant 404 → structuré', async () => {
  const a = await register();
  const r = await api('GET', '/api/vehicles/00000000-0000-0000-0000-000000000000', { token: a.token });
  assert.equal(r.status, 404);
  assertStructuredError(r.data, 404, 'NOT_FOUND');
  assertNoStack(r.data);
});

test('ERRORS: accès inter-utilisateur 403 → FORBIDDEN structuré', async () => {
  const a = await register();
  const b = await register();
  const v = await createVehicle(a.token);
  const r = await api('DELETE', `/api/vehicles/${v.id}`, { token: b.token });
  assert.equal(r.status, 403);
  assertStructuredError(r.data, 403, 'FORBIDDEN');
  assertNoStack(r.data);
});

test('ERRORS: validation 400 → VALIDATION_ERROR structuré', async () => {
  const a = await register();
  const r = await api('POST', '/api/vehicles', {
    token: a.token,
    body: { make: '', model: '', year: 9999, plate: 'X', vin: 'X', mileage: -5 }
  });
  assert.equal(r.status, 400);
  assertStructuredError(r.data, 400, 'VALIDATION_ERROR');
  assertNoStack(r.data);
});

test('ERRORS: aucune erreur 2xx ne porte success:false', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const r = await api('GET', '/api/vehicles', { token: a.token });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.success, false);
  assert.ok(Array.isArray(r.data.vehicles));
});
