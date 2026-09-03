const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, login, ensureAdminRole, uniqEmail, PASS } = require('./helpers');

test('AUTH: enregistrement d un compte client recu 201 + token JWT', async () => {
  const r = await register();
  assert.ok(r.token);
  assert.ok(r.user.id);
  assert.equal(r.user.role, 'CLIENT');
  assert.equal(r.user.email.endsWith('@cauto.test'), true);
});

test('AUTH: enregistrement d un email deja utilise recu 409', async () => {
  const first = await register();
  const r = await api('POST', '/api/auth/register', {
    body: { name: 'Doublon', email: first.user.email, phone: '+22997000000', password: PASS, role: 'CLIENT' }
  });
  assert.equal(r.status, 409);
});

test('AUTH: connexion ok 200 + token, mauvais mot de passe 401', async () => {
  const a = await register();
  const l = await login(a.user.email);
  assert.ok(l.token);
  const bad = await api('POST', '/api/auth/login', {
    body: { email: a.user.email, password: 'Mauvaise111' }
  });
  assert.equal(bad.status, 401);
});

test('AUTH: rafraichissement du token 200 et /auth/me 200', async () => {
  const a = await register();
  const refresh = await api('POST', '/api/auth/refresh', { body: { refresh_token: a.refresh_token } });
  assert.equal(refresh.status, 200);
  assert.ok(refresh.data.token);
  assert.ok(refresh.data.refresh_token);
  const me = await api('GET', '/api/auth/me', { token: a.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.id, a.user.id);
});

test('AUTH: OTP renvoie un code de débogage et le valide', async () => {
  const a = await register();
  const req = await api('POST', '/api/auth/otp/request', { body: { email: a.user.email } });
  assert.equal(req.status, 200);
  // Sans DEMO_MODE, le code est livré au canal 'debug' (mode réel : canal 'demo').
  assert.ok(['demo', 'debug'].includes(req.data.medium));
  assert.ok(req.data.debug_code);
  const verify = await api('POST', '/api/auth/otp/verify', {
    body: { email: a.user.email, code: req.data.debug_code }
  });
  assert.equal(verify.status, 200);
  assert.ok(verify.data.token);
  assert.equal(verify.data.user.email, a.user.email);
});

test('AUTH: logout revoke le refresh token (refresh rejete ensuite)', async () => {
  const a = await register();
  const out = await api('POST', '/api/auth/logout', { token: a.token, body: { refresh_token: a.refresh_token } });
  assert.equal(out.status, 200);
  const refresh = await api('POST', '/api/auth/refresh', { body: { refresh_token: a.refresh_token } });
  assert.equal(refresh.status, 401);
});

test('AUTH: route protegee sans token 401', async () => {
  const r = await api('GET', '/api/auth/me');
  assert.equal(r.status, 401);
});

test('AUTH: admin.demo dispose du role ADMIN (permission backfill)', async () => {
  await ensureAdminRole();
  const l = await login('admin.demo@cauto.local');
  const dash = await api('GET', '/api/admin/dashboard', { token: l.token });
  assert.equal(dash.status, 200);
});