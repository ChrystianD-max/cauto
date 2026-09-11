const { chromium } = require('playwright');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://cauto.onrender.com';

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  const cl = await api('POST', '/api/auth/login', { body: { email: 'client.demo@cauto.local', password: 'Test1234!' } });
  const client = cl.data;
  const veh = await api('GET', '/api/vehicles', { token: client.token });
  const vehicleId = (veh.data.vehicles && veh.data.vehicles[0] && veh.data.vehicles[0].id) || (veh.data && veh.data[0] && veh.data[0].id);
  const ga = await api('POST', '/api/auth/login', { body: { email: 'garage.auto@cauto.local', password: 'Test1234!' } });
  const garage = ga.data;

  const cr = await api('POST', '/api/service-requests', {
    token: client.token,
    body: { vehicle_id: vehicleId, problem_description: 'e2e repro modal reception mobile', category: 'MECANIQUE', urgency: 'NORMAL', preferred_date: null },
  });
  const srId = cr.data.service_request.id;
  await api('POST', '/api/service-requests/' + srId + '/match', { token: client.token, body: {} });
  const det0 = await api('GET', '/api/service-requests/' + srId, { token: client.token });
  const rawMatches = det0.data.service_request.matched_professionals;
  const matches = Array.isArray(rawMatches) ? rawMatches : JSON.parse(rawMatches || '[]');
  const pro = matches.find((m) => m.professional_id === garage.user.id) || matches[0];
  await api('POST', '/api/service-requests/' + srId + '/select', { token: client.token, body: { professional_id: pro.professional_id } });
  await api('POST', '/api/service-requests/' + srId + '/accept', { token: garage.token, body: {} });
  console.log('SR ready:', srId);

  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2.5,
    userAgent: 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errs = [];
  let nativeDialog = false;
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  page.on('dialog', () => { nativeDialog = true; });
  let posted = null;
  page.on('response', (r) => { if (r.url().includes('/reception') && r.request().method() === 'POST') { posted = r.status(); } });

  await page.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); }, [garage.token, garage.user]);
  await page.goto(BASE + '/app/#/pro/service-requests/' + srId, { waitUntil: 'commit', timeout: 60000 });
  await page.waitForTimeout(14000);
  console.log('step: form visible =', await page.locator('#btn-submit-reception').isVisible().catch(() => false));

  await page.fill('#rec-vin', 'WVWZZZ1JZXW000001');
  await page.fill('#rec-km', '98200');
  await page.selectOption('#rec-fuel', '1_2');
  await page.selectOption('#rec-keys', 'false');
  await page.fill('#rec-exterior', 'aucun choc');
  await page.fill('#rec-interior', 'propre');
  console.log('step: form filled');

  await page.locator('#btn-submit-reception').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const before = Date.now();
  const clickRes = await page.evaluate(() => {
    const btn = document.getElementById('btn-submit-reception');
    if (!btn) return 'NO_BUTTON';
    btn.click();
    return 'DISPATCHED';
  }).catch((e) => 'CLICK_ERR ' + e.message);
  console.log('step: click dispatched in', Date.now() - before, 'ms ->', clickRes);

  await page.waitForTimeout(1200);
  console.log('step: nativeDialog =', nativeDialog, '| modal visible =', await page.locator('.ds-modal-backdrop').isVisible().catch(() => false));

  if (nativeDialog) {
    console.log('RESULT: NATIVE DIALOG FIRED');
  } else if (await page.locator('.ds-modal-backdrop').isVisible().catch(() => false)) {
    const title = (await page.locator('.ds-modal-header h3').textContent().catch(() => '')) || '';
    console.log('step: modal title =', JSON.stringify(title.trim()));
    const okClicked = await page.evaluate(() => {
      const btn = document.querySelector('[data-ds-ok]');
      if (!btn) return 'NO_OK';
      btn.click();
      return 'OK_CLICKED';
    }).catch((e) => 'OK_ERR ' + e.message);
    console.log('step: ok click =', okClicked);
    await page.waitForTimeout(6000);
    console.log('step: posted =', posted);
  } else {
    console.log('step: NO MODAL FOUND', 'posted=', posted);
  }

  const det = await api('GET', '/api/service-requests/' + srId, { token: garage.token });
  const srs = det.data.service_request || det.data;
  console.log('step: SR status =', srs.status, '| VIN =', srs.reception_vin);
  console.log('errors:', errs.length ? errs.join(' | ') : 'none');

  const ok = !nativeDialog && posted === 200 && srs.status === 'VEHICLE_RECEIVED';
  console.log('\n' + (ok ? 'RESULT: PASSED' : 'RESULT: FAILED'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });