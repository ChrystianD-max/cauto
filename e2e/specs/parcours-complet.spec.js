const { test, expect } = require('@playwright/test');
const { PASS, uniqueEmail, randomPlate, randomVin, api, loginApi, seedViaLogin, loginUi, navigateTo, extractHashId, clickReady, registerUi } = require('./helpers');

const PRO_EMAIL = 'garage.auto@cauto.local';
const state = {};

test.describe.configure({ mode: 'serial' });

test('1. Inscription client via UI (auto-login)', async ({ page }) => {
  state.email = uniqueEmail('e2ep');
  state.plate = randomPlate();
  state.vin = randomVin();

  await registerUi(page, { name: 'Client E2E Parcours', email: state.email, phone: '+22997000002', role: 'CLIENT' });

  await expect(page).toHaveURL(/#\/app$/);
  await expect(page.locator('body')).toHaveAttribute('data-role', 'CLIENT');
  await expect(page.locator('.demo-pill, .demo-banner')).toHaveCount(0);
});

test('2. Création de véhicule via UI', async ({ request, page }) => {
  await seedViaLogin(request, page, state.email);
  await expect(page).toHaveURL(/#\/app$/);

  await clickReady(page, '.sidebar-nav a[href="#/vehicles"]');
  await expect(page).toHaveURL(/#\/vehicles$/);
  await clickReady(page, 'a[href="#/vehicles/new"]');
  await expect(page.locator('#f-new-veh')).toBeVisible();

  await page.fill('#f-new-veh input[name=make]', 'Toyota');
  await page.fill('#f-new-veh input[name=model]', 'Corolla');
  await page.fill('#f-new-veh input[name=year]', '2020');
  await page.fill('#f-new-veh input[name=plate]', state.plate);
  await page.fill('#f-new-veh input[name=vin]', state.vin);
  await page.fill('#f-new-veh input[name=mileage]', '50000');
  await clickReady(page, '#f-new-veh button[type=submit]');

  await expect(page).toHaveURL(/#\/vehicles$/);
  await expect(page.locator('.veh-card, .card')).toContainText(state.plate);
});

test('3. Demande de service via UI puis sélection du garage (déterministe via API)', async ({ request, page }) => {
  state.clientToken = (await loginApi(request, state.email)).data.token;
  await seedViaLogin(request, page, state.email, PASS, '#/service-requests/new');
  await expect(page.locator('#f-new-sr')).toBeVisible();
  await page.selectOption('#f-new-sr select[name=vehicle_id]', { index: 0 });
  await page.fill('#f-new-sr textarea[name=problem_description]', 'Bruit au freinage avant (E2E parcours)');
  await page.selectOption('#f-new-sr select[name=category]', 'Mecanique');
  await page.selectOption('#f-new-sr select[name=urgency]', 'NORMAL');
  await clickReady(page, '#f-new-sr button[type=submit]');

  await expect(page).toHaveURL(/#\/service-requests\/[0-9a-f-]+$/);
  state.srId = await extractHashId(page);

  const me = await api(request, 'get', '/api/professionals/me', { token: (await loginApi(request, PRO_EMAIL)).data.token });
  expect(me.status).toBe(200);
  state.proId = me.data.professional.id;

  const match = await api(request, 'post', `/api/service-requests/${state.srId}/match`, {
    token: state.clientToken,
    body: { profile: 'STANDARD' },
  });
  expect(match.status).toBe(200);

  const sel = await api(request, 'post', `/api/service-requests/${state.srId}/select`, {
    token: state.clientToken,
    body: { professional_id: state.proId },
  });
  expect(sel.status).toBe(200);
  expect(sel.data.service_request.status).toBe('PROFESSIONAL_SELECTED');
});

test('4. Pro : accepter la prise en charge + soumettre la fiche de réception', async ({ page }) => {
  await loginUi(page, PRO_EMAIL);
  await expect(page).toHaveURL(/#\/pro\/dashboard$/);
  await expect(page.locator('body')).toHaveAttribute('data-role', 'GARAGE');

  await navigateTo(page, '/app/#/pro/service-requests/' + state.srId, page.locator('#btn-accept-sr'));
  await clickReady(page, '#btn-accept-sr');
  await expect(page.locator('#btn-submit-reception')).toBeVisible();

  await page.fill('#rec-vin', state.vin);
  await page.fill('#rec-km', '50250');
  await page.selectOption('#rec-fuel', '1_2');
  await page.selectOption('#rec-keys', { label: 'Oui' });
  await page.fill('#rec-exterior', 'Rayures sur capot');
  await page.fill('#rec-interior', 'Intérieur propre');
  await page.fill('#rec-obs', 'Fiche de réception E2E');
  await clickReady(page, '#btn-submit-reception');

  await expect(page.locator('#rec-vin')).toHaveCount(0);
});

test('5. Client : valider la réception (autorise le diagnostic)', async ({ request, page }) => {
  await seedViaLogin(request, page, state.email);

  await navigateTo(page, '/app/#/service-requests/' + state.srId, page.locator('#btn-validate-reception'));
  await clickReady(page, '#btn-validate-reception');
  await expect(page.locator('#btn-validate-reception')).toHaveCount(0);
});

test('6. Pro : diagnostic + soumission du devis (builder de devis, pièces visibles après soumission)', async ({ request, page }) => {
  await seedViaLogin(request, page, PRO_EMAIL);

  await navigateTo(page, '/app/#/pro/service-requests/' + state.srId, page.locator('#btn-start-diag'));
  await clickReady(page, '#btn-start-diag');

  await expect(page).toHaveURL(/#\/repairs\/[0-9a-f-]+$/);
  state.interventionId = await extractHashId(page);

  await expect(page.locator('#f-diag')).toBeVisible();
  await page.fill('#diag-content', 'Bruit lors du freinage, plaquettes usées.');
  await clickReady(page, '#f-diag button[type=submit]');

  await expect(page.locator('#btn-add-line')).toBeVisible();

  const lines = page.locator('.quote-line');
  let count = await lines.count();
  for (let i = 0; i < 2; i++) {
    if (i >= count) {
      await clickReady(page, '#btn-add-line');
      count++;
    }
    const line = lines.nth(i);
    await line.locator('.ql-label').fill(i === 0 ? 'Plaquettes avant' : 'Main d\u2019oeuvre');
    await line.locator('.ql-kind').selectOption(i === 0 ? 'PARTS' : 'LABOR');
    await line.locator('.ql-qty').fill(i === 0 ? '1' : '2');
    await line.locator('.ql-price').fill(i === 0 ? '150' : '80');
  }

  await page.fill('#q-delay', '2');
  await page.fill('#q-warranty', '12');
  await clickReady(page, '#btn-submit-quote');

  await expect(page.getByText(/310 FCFA/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Devis soumis' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Plaquettes avant')).toBeVisible();
  await expect(page.getByText('Main d\u2019oeuvre')).toBeVisible();

  const repart = await api(request, 'get', '/api/repairs/' + state.interventionId, { token: (await loginApi(request, PRO_EMAIL)).data.token });
  expect(repart.status).toBe(200);
  expect(Array.isArray(repart.data.repair.quote.items)).toBe(true);
  expect(repart.data.repair.quote.items).toHaveLength(2);
});

test('7. Client : approbation du devis via la console intervention', async ({ request, page }) => {
  await seedViaLogin(request, page, state.email);

  await navigateTo(page, '/app/#/repairs/' + state.interventionId, page.locator('#btn-approve-quote'));
  await clickReady(page, '#btn-approve-quote');
  await expect(page.locator('#btn-approve-quote')).toHaveCount(0);
});

test('8. Pro : travaux, contrôle qualité, attente confirmation client', async ({ request, page }) => {
  await seedViaLogin(request, page, PRO_EMAIL);

  await navigateTo(page, '/app/#/repairs/' + state.interventionId, page.locator('#btn-start-work'));
  await clickReady(page, '#btn-start-work');
  await expect(page.locator('#btn-work-done')).toBeVisible();
  await clickReady(page, '#btn-work-done');
  await expect(page.locator('#btn-qc')).toBeVisible();
  await clickReady(page, '#btn-qc');

  await expect(page.getByText(/attente.*confirmation|confirmation.*client/i)).toBeVisible({ timeout: 15000 });
});

test('9. Client : confirmation de bonne réception (clôture)', async ({ request, page }) => {
  await seedViaLogin(request, page, state.email);

  await navigateTo(page, '/app/#/repairs/' + state.interventionId, page.locator('#btn-confirm-pickup'));
  await clickReady(page, '#btn-confirm-pickup');
  await expect(page.locator('#btn-confirm-pickup')).toHaveCount(0);
});

test('10. Paiement (API, UI absente) + garantie + historique (mode réel : pas de pill démo)', async ({ request, page }) => {
  const client = await loginApi(request, state.email);
  expect(client.status).toBe(200);
  state.clientToken = client.data.token;
  await seedViaLogin(request, page, state.email);

  const key = 'e2e_' + Date.now() + Math.floor(Math.random() * 1e6);
  const intent = await api(request, 'post', '/api/payments/intent', {
    token: state.clientToken,
    headers: { 'Idempotency-Key': key },
    body: { intervention_id: state.interventionId },
  });
  expect(intent.status).toBe(201);
  expect(intent.data.payment.status).toBe('PENDING');
  expect(intent.data.demo).toBeFalsy();
  state.paymentId = intent.data.payment.id;

  const confirm = await api(request, 'post', `/api/payments/${state.paymentId}/confirm`, {
    token: state.clientToken,
    body: { outcome: 'succeed' },
  });
  expect(confirm.status).toBe(200);
  expect(confirm.data.payment.status).toBe('SUCCEEDED');

  const vehicles = await api(request, 'get', '/api/vehicles', { token: state.clientToken });
  expect(vehicles.status).toBe(200);
  state.vehicleId = vehicles.data.vehicles.find((v) => v.plate === state.plate).id;

  await navigateTo(page, '/app/#/warranties', page.locator('a.card.veh-card-link').first());

  await navigateTo(page, `/app/#/vehicles/${state.vehicleId}/history`, page.getByText(/Paiement confirmé/));
  await expect(page.getByText(/clôtur|clottur|clotur/i)).toBeVisible();
  await expect(page.locator('.demo-pill, .demo-banner')).toHaveCount(0);
});

test('11. Flux de matching via UI (bouton #btn-match-sr + sélection de pro)', async ({ request, page }) => {
  await seedViaLogin(request, page, state.email);

  const sr = await api(request, 'post', '/api/service-requests', {
    token: state.clientToken,
    body: {
      vehicle_id: state.vehicleId,
      problem_description: 'Petite intervention shuffle E2E - matching UI',
      category: 'Mecanique',
      urgency: 'NORMAL',
    },
  });
  expect(sr.status).toBe(200);
  state.matchSrId = sr.data.service_request.id;

  await navigateTo(page, '/app/#/service-requests/' + state.matchSrId, page.locator('#btn-match-sr'));
  await clickReady(page, '#btn-match-sr');

  const select = page.locator('.btn-select-pro').first();
  await expect(select).toBeVisible({ timeout: 15000 });
  const proId = await select.getAttribute('data-pro-id');
  expect(proId).toBeTruthy();

  await clickReady(page, `.btn-select-pro[data-pro-id="${proId}"]`);
  await expect.poll(async () => {
    const after = await api(request, 'get', `/api/service-requests/${state.matchSrId}`, { token: state.clientToken });
    return after.status === 200 ? after.data.service_request.status : null;
  }, { timeout: 15000, message: 'statut après sélection via UI' }).toMatch(/SELECTED|ACCEPTED/);
});