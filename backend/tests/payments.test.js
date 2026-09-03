const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { api, register, buildJourney } = require('./helpers');

const key = () => 'key_' + crypto.randomBytes(12).toString('hex');

test('PAYMENTS: intention sans Idempotency-Key rejetee (400)', async () => {
  const { interventionId, client } = await buildJourney();
  const r = await api('POST', '/api/payments/intent', {
    token: client.token, body: { intervention_id: interventionId, method: 'CARD' }
  });
  assert.equal(r.status, 400);
});

test('PAYMENTS: succes - paiement SUCCEEDED + garantie + historique', async () => {
  const { interventionId, vehicle, client } = await buildJourney();
  const intent = await api('POST', '/api/payments/intent', {
    token: client.token,
    headers: { 'Idempotency-Key': key() },
    body: { intervention_id: interventionId, method: 'CARD' }
  });
  assert.equal(intent.status, 201);
  assert.equal(intent.data.sandbox, true);
  // Mode réel : le champ 'demo' n'est plus présent (suppression du mode démo).
  assert.ok(!intent.data.demo);
  assert.ok(intent.data.payment.amount_cents >= 31000);
  assert.equal(intent.data.payment.status, 'PENDING');
  const paymentId = intent.data.payment.id;

  const confirm = await api('POST', `/api/payments/${paymentId}/confirm`, {
    token: client.token, body: { outcome: 'succeed' }
  });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.data.payment.status, 'SUCCEEDED');

  const w = await api('GET', `/api/warranties/vehicle/${vehicle.id}`, { token: client.token });
  assert.equal(w.status, 200);
  assert.ok(w.data.warranties.some((x) => x.intervention_id === interventionId), 'garantie activée');

  const hist = await api('GET', `/api/vehicles/${vehicle.id}/history`, { token: client.token });
  assert.ok(hist.data.history.some((e) => e.title.includes('Paiement confirmé')));
});

test('PAYMENTS: idempotence - meme cle = meme paiement (reused)', async () => {
  const { interventionId, client } = await buildJourney();
  const k = key();
  const first = await api('POST', '/api/payments/intent', {
    token: client.token, headers: { 'Idempotency-Key': k },
    body: { intervention_id: interventionId, method: 'CARD' }
  });
  assert.equal(first.status, 201);
  const second = await api('POST', '/api/payments/intent', {
    token: client.token, headers: { 'Idempotency-Key': k },
    body: { intervention_id: interventionId, method: 'CARD' }
  });
  assert.equal(second.status, 200);
  assert.equal(second.data.reused, true);
  assert.equal(second.data.payment.id, first.data.payment.id);
});

test('PAYMENTS: wallet - echec = remboursement automatique, solde conserve', async () => {
  const { interventionId, client } = await buildJourney();
  const topup = await api('POST', '/api/payments/wallet/topup', { token: client.token, body: { amount_cents: 50000 } });
  assert.equal(topup.status, 200);
  assert.equal(topup.data.wallet.balance_cents, 50000);

  const intent = await api('POST', '/api/payments/intent', {
    token: client.token,
    headers: { 'Idempotency-Key': key() },
    body: { intervention_id: interventionId, method: 'CAUTO_WALLET' }
  });
  assert.equal(intent.status, 201);
  const before = await api('GET', '/api/payments/wallet', { token: client.token });
  assert.ok(before.data.wallet.balance_cents < 50000, 'solde debite');

  const confirm = await api('POST', `/api/payments/${intent.data.payment.id}/confirm`, {
    token: client.token, body: { outcome: 'fail' }
  });
  assert.equal(confirm.status, 200);
  assert.equal(confirm.data.payment.status, 'FAILED');
  assert.ok(confirm.data.refund, 'remboursement automatique');

  const after = await api('GET', '/api/payments/wallet', { token: client.token });
  assert.equal(after.data.wallet.balance_cents, 50000, 'solde restaure apres remboursement');
});

test('PAYMENTS: paiement par un tiers interdit (403)', async () => {
  const { interventionId } = await buildJourney();
  const other = await register();
  const r = await api('POST', '/api/payments/intent', {
    token: other.token,
    headers: { 'Idempotency-Key': key() },
    body: { intervention_id: interventionId, method: 'CARD' }
  });
  assert.equal(r.status, 403);
});

test('PAYMENTS: intervention non close ou devis non valide = 409', async () => {
  const { interventionId, client } = await buildJourney({ stage: 'quote' });
  const r = await api('POST', '/api/payments/intent', {
    token: client.token,
    headers: { 'Idempotency-Key': key() },
    body: { intervention_id: interventionId, method: 'CARD' }
  });
  assert.equal(r.status, 409);
});