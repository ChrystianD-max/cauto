const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { BASE, uniqEmail } = require('./helpers');

// Appels bruts : l'en-tête Set-Cookie n'est pas exposé par le helper api().
function call(method, p, { body, cookie, token } = {}) {
  return new Promise((resolve) => {
    const req = require('https').request(BASE + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      }
    }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { b += d; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(b); } catch { /* non-JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });
    req.on('error', (e) => resolve({ status: -1, headers: {}, data: String(e) }));
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

// Extrait (name, value) et attrs depuis une valeur Set-Cookie.
function parseSetCookie(sc) {
  const parts = String(sc).split(';').map((s) => s.trim());
  const [kv] = parts;
  const eq = kv.indexOf('=');
  return { name: kv.slice(0, eq), value: kv.slice(eq + 1), attrs: parts.slice(1) };
}

function setCookieHeader(headers) {
  const sc = headers['set-cookie'];
  return Array.isArray(sc) ? sc : (sc ? [sc] : []);
}

const COOKIE = 'cauto_refresh';

test('HTTPS: l inscription pose un cookie de refresh httpOnly (Path=/api/auth, SameSite=Lax)', async () => {
  const r = await call('POST', '/api/auth/register', {
    body: { name: 'Cookie Test', email: uniqEmail(), phone: '+22997000001', password: 'Test1234!', role: 'CLIENT' }
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const sc = setCookieHeader(r.headers).find((c) => parseSetCookie(c).name === COOKIE);
  assert.ok(sc, 'Set-Cookie ' + COOKIE + ' absent');
  const { value, attrs } = parseSetCookie(sc);
  assert.ok(value.length >= 10, 'valeur du cookie vide');
  assert.ok(attrs.some((a) => /^HttpOnly$/i.test(a)), 'flag HttpOnly absent');
  assert.ok(attrs.some((a) => /^SameSite=lax$/i.test(a)), 'flag SameSite=Lax absent');
  assert.ok(attrs.some((a) => /^Path=\/api\/auth$/i.test(a)), 'flag Path=/api/auth absent');
  assert.ok(attrs.some((a) => /^Max-Age=/i.test(a)), 'flag Max-Age absent');
});

test('HTTPS: refresh possible via le cookie seul (sans corps) + rotation re-posée', async () => {
  const reg = await call('POST', '/api/auth/register', {
    body: { name: 'Cookie Refresh', email: uniqEmail(), phone: '+22997000002', password: 'Test1234!', role: 'CLIENT' }
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const first = parseSetCookie(setCookieHeader(reg.headers).find((c) => parseSetCookie(c).name === COOKIE));

  const ref = await call('POST', '/api/auth/refresh', { cookie: `${COOKIE}=${first.value}` });
  assert.equal(ref.status, 200, JSON.stringify(ref.data));
  assert.ok(ref.data.refresh_token && ref.data.token, 'le corps doit toujours renvoyer les tokens');
  const second = parseSetCookie(setCookieHeader(ref.headers).find((c) => parseSetCookie(c).name === COOKIE));
  assert.ok(second, 'nouveau Set-Cookie attendu (rotation)');
  assert.notEqual(second.value, first.value, 'le cookie doit être tourné');
});

test('HTTPS: logout efface le cookie (Max-Age=0) et révoque le refresh', async () => {
  const reg = await call('POST', '/api/auth/register', {
    body: { name: 'Cookie Logout', email: uniqEmail(), phone: '+22997000003', password: 'Test1234!', role: 'CLIENT' }
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  const { value } = parseSetCookie(setCookieHeader(reg.headers).find((c) => parseSetCookie(c).name === COOKIE));

  const out = await call('POST', '/api/auth/logout', {
    token: reg.data.token,
    cookie: `${COOKIE}=${value}`
  });
  assert.equal(out.status, 200, JSON.stringify(out.data));
  const cleared = parseSetCookie(setCookieHeader(out.headers).find((c) => parseSetCookie(c).name === COOKIE));
  const expired = cleared.attrs.some((a) => /^Max-Age=0$/i.test(a)) || cleared.attrs.some((a) => /^Expires=Thu, 01 Jan 1970/i.test(a));
  assert.ok(expired && cleared.value === '', 'le cookie doit être supprimé (Expires=1970 / Max-Age=0)');

  const after = await call('POST', '/api/auth/refresh', { cookie: `${COOKIE}=${value}` });
  assert.equal(after.status, 401, 'refresh token révoqué refusé');
});

// Flags applicables en production (Secure) — on repasse par config.js dans un
// process séparé pour pouvoir fixer NODE_ENV/COOKIE_SECURE (cache module).
const configPath = path.join(__dirname, '..', 'src', 'config.js');
function configIn(envExtra) {
  const out = execFileSync(process.execPath, ['-e', `
    ${envExtra}
    delete require.cache[require.resolve(${JSON.stringify(configPath)})];
    const c = require(${JSON.stringify(configPath)});
    console.log(JSON.stringify({ secure: c.cookie.secure, httpOnly: c.cookie.httpOnly, sameSite: c.cookie.sameSite, name: c.cookie.name, path: c.cookie.path }));
  `], { encoding: 'utf8' });
  return JSON.parse(out.trim().split('\n').pop());
}

test('HTTPS: en NODE_ENV=production le cookie est Secure (httpOnly + SameSite=Lax)', () => {
  const c = configIn(`process.env.NODE_ENV = 'production';`);
  assert.equal(c.secure, true, 'Secure doit être actif en production');
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'lax');
  assert.equal(c.name, 'cauto_refresh');
  assert.equal(c.path, '/api/auth');
});

test('HTTPS: hors production le cookie nest PAS Secure (sauf COOKIE_SECURE=true)', () => {
  const staging = configIn(`delete process.env.NODE_ENV;`);
  assert.equal(staging.secure, false, 'staging : pas de Secure');
  const forced = configIn(`delete process.env.NODE_ENV; process.env.COOKIE_SECURE = 'true';`);
  assert.equal(forced.secure, true, 'COOKIE_SECURE=true force Secure');
});