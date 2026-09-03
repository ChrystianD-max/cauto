const { expect } = require('@playwright/test');

const PASS = 'Test1234!';

function uniqueEmail(prefix = 'e2e') {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@cauto.test`;
}

function randomPlate() {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return 'E2E' + s + Math.floor(Math.random() * 10);
}

function randomVin() {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 17; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function api(request, method, path, { token, body, headers } = {}) {
  const res = await request[method.toLowerCase()](path, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    data: body,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status(), data };
}

async function loginApi(request, email, password = PASS) {
  return api(request, 'post', '/api/auth/login', { body: { email, password } });
}

async function logoutUi(page) {
  await page.click('#btn-logout');
  await expect(page).toHaveURL(/#\/login$/);
}

function acceptDialogs(page) {
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => d.accept());
}

async function loginUi(page, email, password = PASS) {
  acceptDialogs(page);
  await page.goto('/app/#/login', { waitUntil: 'commit' });
  await page.fill('#f-login input[name=email]', email);
  await page.fill('#f-login input[name=password]', password);
  await page.click('#f-login button[type=submit]');
}

// Module 62 — inscription multi-étapes (une information par écran) :
// nom → email → téléphone → rôle → (garage si GARAGE) → mot de passe → créer.
async function registerUi(page, fields) {
  acceptDialogs(page);
  await page.goto('/app/#/register', { waitUntil: 'commit' });
  await expect(page.locator('#f-reg')).toBeVisible();
  const next = () => page.click('#f-reg #reg-next');
  await page.locator('#r-step-name').waitFor({ state: 'visible' });
  await page.fill('#r-name', fields.name);
  await next();
  await page.locator('#r-step-email').waitFor({ state: 'visible' });
  await page.fill('#r-email', fields.email);
  await next();
  await page.locator('#r-step-phone').waitFor({ state: 'visible' });
  await page.fill('#r-phone', fields.phone);
  await next();
  await page.locator('#r-step-role').waitFor({ state: 'visible' });
  await page.click(`#r-step-role input[value="${fields.role}"]`);
  await next();
  if (fields.role === 'GARAGE') {
    await page.locator('#r-step-garage').waitFor({ state: 'visible' });
    await page.fill('#r-garage', fields.garage_name || fields.name + ' SARL');
    await next();
  }
  await page.locator('#r-step-password').waitFor({ state: 'visible' });
  await page.fill('#r-password', fields.password || PASS);
  await next();
}

async function seedSession(page, token, user, route = '#/app') {
  acceptDialogs(page);
  await page.addInitScript(
    ([t, u]) => {
      try {
        localStorage.setItem('token', t);
        localStorage.setItem('user', JSON.stringify(u));
      } catch {}
    },
    [token, user],
  );
  await page.goto(`/app/${route}`, { waitUntil: 'commit' });
}

async function seedViaLogin(request, page, email, password = PASS, route = '#/app') {
  const { data } = await loginApi(request, email, password);
  expect(data.token).toBeTruthy();
  await seedSession(page, data.token, data.user, route);
}

async function navigateTo(page, hashUrl, ready) {
  for (let i = 0; i < 3; i++) {
    if (i === 0) {
      await page.goto(hashUrl, { waitUntil: 'commit' });
    } else {
      await page.reload({ waitUntil: 'commit' });
    }
    try {
      await expect(ready).toBeVisible({ timeout: 10000 });
      return;
    } catch {}
  }
  throw new Error('Échec de navigation vers ' + hashUrl);
}

async function extractHashId(page) {
  const url = page.url();
  const m = url.match(/#\/(?:pro\/)?(?:service-requests|repairs)\/([0-9a-f-]+)/);
  expect(m).not.toBeNull();
  return m[1];
}

async function clickReady(page, selector, opts = {}) {
  const locator = page.locator(selector);
  const deadline = Date.now() + (opts.totalTimeout || 90000);
  for (;;) {
    try {
      await expect(locator).toBeVisible({ timeout: Math.min(10000, Math.max(1500, deadline - Date.now())) });
      await locator.click({ force: true, noWaitAfter: true, timeout: 8000 });
      return;
    } catch (e) {
      if (Date.now() >= deadline) throw e;
      await page.reload({ waitUntil: 'commit' }).catch(() => {});
    }
  }
}

module.exports = { PASS, uniqueEmail, randomPlate, randomVin, api, loginApi, seedSession, seedViaLogin, loginUi, registerUi, navigateTo, extractHashId, clickReady };