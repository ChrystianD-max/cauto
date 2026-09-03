const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, buildJourney } = require('./helpers');

test('QUOTES: devis cree par le pro avec items et total corrects (PENDING)', async () => {
  const { quoteId, pro, client, interventionId } = await buildJourney({ stage: 'quote' });
  const r = await api('GET', `/api/quotes/${quoteId}`, { token: pro });
  assert.equal(r.status, 200);
  const q = r.data.quote;
  assert.equal(q.status, 'PENDING');
  assert.equal(q.total_cents, 31000);
  assert.equal(q.delay_days, 2);
  assert.equal(q.warranty_months, 12);
  assert.equal(q.items.length, 2);
  assert.equal(q.created_by, (await api('GET', '/api/auth/me', { token: pro })).data.user.id);
  const visible = await api('GET', `/api/quotes?intervention_id=${interventionId}`, { token: client.token });
  assert.ok(visible.data.quotes.some((x) => x.id === quoteId));
});

test('QUOTES: refuse avec motif enregistre (REFUSED)', async () => {
  const { quoteId, client } = await buildJourney({ stage: 'quote' });
  const r = await api('POST', `/api/quotes/${quoteId}/refuse`, {
    token: client.token,
    body: { reason: 'Prix trop eleve', comment: 'Merci de revoir', request_discount: true }
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.quote.status, 'REFUSED');
  assert.ok(r.data.quote.refusal_reason);
});

test('QUOTES: refus sans motif refuse (400)', async () => {
  const { quoteId, client } = await buildJourney({ stage: 'quote' });
  const r = await api('POST', `/api/quotes/${quoteId}/refuse`, { token: client.token, body: {} });
  assert.equal(r.status, 400);
});

test('QUOTES: remise concedee par le pro puis approbation client', async () => {
  const { quoteId, client, pro } = await buildJourney({ stage: 'quote' });
  const ref = await api('POST', `/api/quotes/${quoteId}/refuse`, {
    token: client.token, body: { reason: 'Trop cher', request_discount: true }
  });
  assert.equal(ref.status, 200);

  const remise = await api('POST', `/api/quotes/${quoteId}/remise`, {
    token: pro, body: { grant: true, discount_percent: 10 }
  });
  assert.equal(remise.status, 200);
  assert.equal(remise.data.quote.status, 'PENDING');
  assert.equal(remise.data.quote.discount_granted, true);
  assert.equal(remise.data.quote.total_cents, 27900);

  const appr = await api('POST', `/api/quotes/${quoteId}/approve`, { token: client.token, body: {} });
  assert.equal(appr.status, 200);
  assert.equal(appr.data.quote.status, 'APPROVED');
});

test('QUOTES: remise sans refus prealable 409', async () => {
  const { quoteId, pro } = await buildJourney({ stage: 'quote' });
  const r = await api('POST', `/api/quotes/${quoteId}/remise`, { token: pro, body: { grant: true, discount_percent: 10 } });
  assert.equal(r.status, 409);
});

test('QUOTES: un seul devis par intervention - double creation rejetee 409', async () => {
  const { quoteId, pro, interventionId } = await buildJourney({ stage: 'quote' });
  const second = await api('POST', '/api/quotes', {
    token: pro,
    body: {
      intervention_id: interventionId,
      items: [{ label: 'Equilibrage roues', kind: 'LABOR', qty: 1, unit_price_cents: 4500 }],
      delay_days: 1
    }
  });
  assert.equal(second.status, 409);
  assert.ok(second.data.error.message.includes('un seul devis'));

  const complementary = await api('POST', '/api/quotes', {
    token: pro,
    body: {
      intervention_id: interventionId,
      items: [{ label: 'Equilibrage roues', kind: 'LABOR', qty: 1, unit_price_cents: 4500 }],
      is_complementary: true,
      complementary_message: 'Equilibrage constaté pendant le test'
    }
  });
  assert.equal(complementary.status, 409);

  const still = await api('GET', '/api/quotes', { token: pro });
  assert.equal(still.status, 200);
  assert.equal(still.data.quotes.filter((q) => q.intervention_id === interventionId).length, 1);
});

test('QUOTES: travaux supplémentaires - autorisation client requise', async () => {
  const { interventionId, client, pro } = await buildJourney({ stage: 'repairing' });

  const extra = await api('POST', `/api/interventions/${interventionId}/extra-work`, {
    token: pro,
    body: {
      label: 'Remplacement disque de frein avant droit',
      explanation: 'Usure profonde constatée à l inspection, nécessite remplacement.',
      parts_cents: 22000, labor_cents: 10000, delay_days: 1
    }
  });
  assert.equal(extra.status, 201);
  const extraId = extra.data.extra_work.id;
  assert.equal(extra.data.extra_work.status, 'PENDING');

  const taskBefore = await api('POST', `/api/interventions/${interventionId}/tasks`, {
    token: pro, body: { label: 'Poser disque', extra_request_id: extraId }
  });
  assert.equal(taskBefore.status, 403);

  const refuse = await api('POST', `/api/interventions/extra-works/${extraId}/decision`, {
    token: client.token, body: { approve: false }
  });
  assert.equal(refuse.status, 200);
  assert.equal(refuse.data.status, 'REFUSED');

  const after = await api('POST', `/api/interventions/${interventionId}/tasks`, {
    token: pro, body: { label: 'Poser disque', extra_request_id: extraId }
  });
  assert.equal(after.status, 403);
});