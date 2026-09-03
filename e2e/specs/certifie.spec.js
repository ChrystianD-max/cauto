const { test, expect } = require('@playwright/test');
const {
  PASS, uniqueEmail, api, loginApi, seedViaLogin, seedSession, navigateTo, clickReady, registerUi,
} = require('./helpers');

test.describe.configure({ mode: 'serial' });

const state = {};

test('1. Inscription garage via UI → profil pro sans badge bleu', async ({ page }) => {
  state.email = uniqueEmail('cert');
  state.name = 'Garage Badge ' + Date.now().toString(36);

  await registerUi(page, { name: state.name, email: state.email, phone: '+22997002222', role: 'GARAGE', garage_name: state.name + ' SARL' });

  await expect(page.locator('body')).toHaveAttribute('data-role', 'GARAGE');
  await expect(page).toHaveURL(/#\/pro\/profile$/);

  await expect(page.locator('.pro-profile-hero')).toBeVisible();
  await expect(page.locator('.pro-profile-hero .cert-badge')).toHaveCount(0);
  await expect(page.locator('.sidebar .cert-badge')).toHaveCount(0);
});

test('2. L`admin certifie le garage (API admin) → is_certified=true', async ({ request }) => {
  const pro = await loginApi(request, state.email);
  expect(pro.data.token).toBeTruthy();
  const me = await api(request, 'get', '/api/professionals/me', { token: pro.data.token });
  expect(me.status).toBe(200);
  state.proId = me.data.professional.id;

  const adm = await loginApi(request, 'admin.demo@cauto.local');
  expect(adm.data.token).toBeTruthy();

  const cert = await api(request, 'patch', `/api/admin/professionals/${state.proId}/certify`, { token: adm.data.token, body: { certified: true } });
  expect(cert.status).toBe(200);
  expect(cert.data.professional.is_certified).toBe(true);
});

test('3. Le professionnel voit le badge bleu à côté de son nom (sidebar + profil)', async ({ page, request }) => {
  await seedViaLogin(request, page, state.email, PASS, '#/pro/profile');
  await expect(page.locator('.pro-profile-hero')).toBeVisible();
  await expect(page.locator('.pro-profile-hero h1')).toContainText(state.name);
  await expect(page.locator('.pro-profile-hero .cert-badge')).toBeVisible();

  await navigateTo(page, '/app/#/pro/dashboard', page.locator('.dash-header'));
  await expect(page.locator(`.sidebar-link:has-text("${state.name}") .cert-badge`)).toBeVisible();
});

test('4. Le client voit le badge bleu à côté du nom (annuaire + fiche pro)', async ({ page, request }) => {
  const repos = await api(request, 'get', `/api/admin/professionals/${state.proId}`, { token: (await loginApi(request, 'admin.demo@cauto.local')).data.token });
  expect(repos.status).toBe(200);
  if (!repos.data.professional.is_certified) {
    const adm = await loginApi(request, 'admin.demo@cauto.local');
    const cert = await api(request, 'patch', `/api/admin/professionals/${state.proId}/certify`, { token: adm.data.token, body: { certified: true } });
    expect(cert.data.professional.is_certified).toBe(true);
  }

  const client = await api(request, 'post', '/api/auth/register', {
    body: { name: 'Client E2E Badge', email: uniqueEmail('cb'), phone: '+22997002223', password: PASS, role: 'CLIENT' },
  });
  expect(client.status).toBe(201);
  await seedSession(page, client.data.token, client.data.user, '#/professionals');
  await navigateTo(page, '/app/#/professionals', page.locator('#f-filter-pro'));

  await page.fill('#f-filter-pro input[name=q]', state.name);
  await page.click('#f-filter-pro button[type=submit]');
  const card = page.locator(`.veh-card-link:has-text("${state.name}")`).first();
  await expect(card).toBeVisible();
  await expect(card.locator('h3 .cert-badge')).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(/#\/professionals\/[0-9a-f-]+$/);
  await expect(page.locator('.page-top h1')).toContainText(state.name);
  await expect(page.locator('.page-top h1 .cert-badge')).toBeVisible();
});

test('5. L`admin voit le statut « Certifié » sur la fiche pro', async ({ page, request }) => {
  await seedViaLogin(request, page, 'admin.demo@cauto.local', PASS, '#/admin/professionals/' + state.proId);
  await expect(page.locator('.ad-shell')).toBeVisible();
  await expect(page.locator('.ad-badge.blue:has-text("Certifié")')).toBeVisible();
});