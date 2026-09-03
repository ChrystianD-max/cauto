const { test, expect } = require('@playwright/test');
const {
  PASS, uniqueEmail, randomPlate, randomVin,
  api, loginApi, seedViaLogin, navigateTo, clickReady, registerUi,
} = require('./helpers');

test.describe.configure({ mode: 'serial' });

const state = {};

test('1. Inscription fournisseur via UI → espace fournisseur (création boutique)', async ({ page }) => {
  state.email = uniqueEmail('e2esp');

  await registerUi(page, { name: 'Fournisseur E2E Espace', email: state.email, phone: '+22997001111', role: 'SUPPLIER' });

  await expect(page.locator('body')).toHaveAttribute('data-role', 'SUPPLIER');
  await expect(page).toHaveURL(/#\/supplier\/dashboard$/);
  await expect(page.locator('#sp-create')).toBeVisible();

  await page.fill('#sp-create input[name=name]', 'Boutique E2E ' + Date.now().toString(36));
  await page.fill('#sp-create input[name=contact_name]', 'Rachid Hounkpatin');
  await page.fill('#sp-create input[name=email]', uniqueEmail('sp'));
  await page.fill('#sp-create input[name=phone]', '+22997001112');
  await page.fill('#sp-create input[name=address]', 'Cotonou, rue des pièces');
  await page.fill('#sp-create textarea[name=description]', 'Pieces qualites livraison rapide');
  await clickReady(page, '#sp-create button[type=submit]');

  await expect(page.locator('.stat-grid')).toBeVisible();
  await expect(page.locator('.badge-ok')).toContainText('Boutique active');
  await expect(page.locator('.banner-warn')).toContainText('attestations');
});

test('2. Publier une pièce via UI (+ prix FCFA) puis compatibilité véhicule', async ({ page, request }) => {
  await seedViaLogin(request, page, state.email);
  state.ref = 'REF-E2E-' + Date.now().toString(36).toUpperCase();

  await navigateTo(page, '/app/#/supplier/products', page.locator('h1:has-text("Mes produits")'));
  await clickReady(page, 'a.btn[href="#/supplier/products/new"]');
  await expect(page.locator('#sp-prod')).toBeVisible();

  await page.fill('#sp-prod input[name=reference]', state.ref);
  await page.fill('#sp-prod input[name=name]', 'Disque de frein AV E2E');
  await page.fill('#sp-prod input[name=brand]', 'Brembo');
  await page.selectOption('#sp-prod select[name=category]', 'PREMIUM');
  await page.fill('#sp-prod input[name=unit_price_cents]', '4500');
  await page.fill('#sp-prod input[name=stock_quantity]', '12');
  await page.fill('#sp-prod input[name=min_stock]', '2');
  await clickReady(page, '#sp-prod button[type=submit]');

  await expect(page).toHaveURL(/#\/supplier\/products\/[0-9a-f-]+$/);
  const mPart = page.url().match(/#\/supplier\/products\/([0-9a-f-]+)/);
  expect(mPart).not.toBeNull();
  state.partId = mPart[1];

  await expect(page.locator('#sp-prod input[name=unit_price_cents]')).toHaveValue('4500');
  await expect(page.locator('body')).toContainText('Prix unitaire (FCFA)');

  await page.fill('#sp-comp input[name=make]', 'Renault');
  await page.fill('#sp-comp input[name=model]', 'Clio 4');
  await page.fill('#sp-comp input[name=years]', '2012-2019');
  await clickReady(page, '#sp-comp button[type=submit]');
  await expect(page.locator('#sp-comp-list')).toContainText('Renault Clio 4');

  await navigateTo(page, '/app/#/supplier/inventory', page.locator('.card .table'));
  await expect(page.locator('tbody')).toContainText(state.ref);
  await expect(page.locator('tbody')).toContainText('FCFA');
});

test("3. Commande client créée via API → traitée dans l'onglet Commandes (FCFA affiché)", async ({ page, request }) => {
  await seedViaLogin(request, page, state.email);

  const cli = await api(request, 'post', '/api/auth/register', {
    body: { name: 'Client Pieces', email: uniqueEmail('cl'), phone: '+22997002222', password: PASS, role: 'CLIENT' },
  });
  expect(cli.status).toBe(201);
  const ct = cli.data.token;

  const v = await api(request, 'post', '/api/vehicles', {
    token: ct,
    body: { make: 'Toyota', model: 'Yaris', year: 2021, plate: randomPlate(), vin: randomVin(), mileage: 10000, fuel_type: 'ESSENCE', gearbox: 'MANUELLE', transmission: 'TWD' },
  });
  expect(v.status).toBe(201);

  const o = await api(request, 'post', '/api/parts/orders', {
    token: ct,
    body: { part_id: state.partId, quantity: 2, vehicle_id: v.data.vehicle.id, address: 'Cotonou', notes: 'Urgent' },
  });
  expect(o.status).toBe(201);
  state.orderId = o.data.order.id;
  expect(o.data.order.status).toBe('PENDING');

  await navigateTo(page, '/app/#/supplier/orders', page.locator('#sp-orders'));
  const row = page.locator(`#sp-orders tr:has-text("${state.ref}")`);
  await expect(row).toBeVisible();
  await expect(row).toContainText('9 000 FCFA');
  await expect(row).toContainText('En attente');

  await clickReady(page, `#sp-orders button[data-st^="${state.orderId}:CONFIRMED"]`);
  await expect(page.locator(`#sp-orders tr:has-text("${state.ref}")`)).toContainText('Confirmée');

  await clickReady(page, `#sp-orders button[data-st^="${state.orderId}:SHIPPED"]`);
  await expect(page.locator(`#sp-orders tr:has-text("${state.ref}")`)).toContainText('Expédiée');
});

test('4. Attestations → vérification admin → badge Boutique vérifiée', async ({ page, request }) => {
  const login = await loginApi(request, state.email);
  expect(login.data.token).toBeTruthy();
  const sup = await api(request, 'get', '/api/suppliers/mine', { token: login.data.token });
  expect(sup.status).toBe(200);
  state.supplierId = sup.data.supplier.id;

  const att = await api(request, 'patch', '/api/suppliers/mine', {
    token: login.data.token,
    body: { attestation_doc_ids: ['00000000-0000-0000-0000-000000000099'] },
  });
  expect(att.status).toBe(200);
  expect(att.data.supplier.verification_status).toBe('PENDING');

  const adm = await loginApi(request, 'admin.demo@cauto.local');
  expect(adm.data.token).toBeTruthy();
  const verify = await api(request, 'patch', `/api/admin/suppliers/${state.supplierId}/verify`, {
    token: adm.data.token, body: { verified: true },
  });
  expect(verify.status).toBe(200);
  expect(verify.data.supplier.verification_status).toBe('VERIFIED');

  await seedViaLogin(request, page, state.email);
  await navigateTo(page, '/app/#/supplier/dashboard', page.locator('.stat-grid'));
  await expect(page.locator('body')).toContainText('Vérifiée');
  await expect(page.locator('.banner-warn')).toHaveCount(0);
});