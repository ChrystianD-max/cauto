// MODULE 76 — ADMIN SUPER ADMIN.
//   - Un ADMIN standard n'accède pas aux routes super-admin.
//   - Le SUPER_ADMIN gère admins, permissions, paramètres critiques, pays,
//     devises, intégrations et consulte le journal d'audit enrichi.
//   - Les actions sensibles (mutations) exigent une confirmation renforcée
//     (mot de passe ou OTP SUPER_CONFIRM).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, login, register, uniqEmail, uniqPlate, PASS } = require('./helpers');
const rand = () => Math.random().toString(36).slice(2, 8);

const SA_EMAIL = 'superadmin@cauto.local';
const SA_PASS = PASS; // même mot de passe que admin@cauto.local

let CACHED_SA_TOKEN = null;
async function saToken() {
  if (CACHED_SA_TOKEN) return CACHED_SA_TOKEN;
  const l = await login(SA_EMAIL, SA_PASS);
  CACHED_SA_TOKEN = l.token;
  return l.token;
}

// Demande un OTP pour un compte donné et renvoie le code (mode debug démo).
async function requestOtp(email, purpose = 'SUPER_CONFIRM') {
  const r = await api('POST', '/api/auth/otp/request', { body: { email, purpose } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.debug_code;
}

test('SA: un ADMIN standard est refusé sur les routes super-admin', async () => {
  // admin@cauto.local est un ADMIN classique (pas SUPER_ADMIN).
  const l = await login('admin@cauto.local', PASS);
  const r = await api('GET', '/api/super-admin/admins', { token: l.token });
  assert.equal(r.status, 403, JSON.stringify(r.data));
});

test('SA: sans confirmation, une mutation sensible est refusée (401)', async () => {
  const token = await saToken();
  const r = await api('POST', '/api/super-admin/admins', {
    token,
    body: { name: 'Admin X', email: uniqEmail(), password: 'AnotherPass1' }
  });
  assert.equal(r.status, 401, JSON.stringify(r.data));
});

test('SA: le SUPER_ADMIN liste les administrateurs', async () => {
  const token = await saToken();
  const r = await api('GET', '/api/super-admin/admins', { token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(Array.isArray(r.data.admins));
  assert.ok(r.data.admins.some((a) => a.email === SA_EMAIL), 'superadmin présent');
});

test('SA: le SUPER_ADMIN crée un admin avec confirmation mot de passe', async () => {
  const token = await saToken();
  const email = uniqEmail();
  const r = await api('POST', '/api/super-admin/admins', {
    token,
    body: { name: 'Admin Créé', email, password: 'AnotherPass1', role: 'ADMIN', confirm_password: SA_PASS }
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.admin.role, 'ADMIN');
  // Le nouvel admin peut se connecter.
  const l = await login(email, 'AnotherPass1');
  assert.equal(l.token ? true : false, true);
  // ...et il ne peut pas, lui, accéder à la console super-admin.
  const denied = await api('GET', '/api/super-admin/admins', { token: l.token });
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
});

test('SA: confirmation avec mot de passe incorrect → 401', async () => {
  const token = await saToken();
  const r = await api('POST', '/api/super-admin/admins', {
    token,
    body: { name: 'X', email: uniqEmail(), password: 'AnotherPass1', confirm_password: 'WRONG-PASS' }
  });
  assert.equal(r.status, 401, JSON.stringify(r.data));
});

test('SA: le SUPER_ADMIN suspend un admin avec confirmation OTP', async () => {
  const token = await saToken();
  // Créer un admin à suspendre (avec confirmation password).
  const email = uniqEmail();
  const created = await api('POST', '/api/super-admin/admins', {
    token,
    body: { name: 'Admin Suspendu', email, password: 'AnotherPass1', role: 'ADMIN', confirm_password: SA_PASS }
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const adminId = created.data.admin.id;

  // Sans OTP → 401.
  const noOtp = await api('POST', `/api/super-admin/admins/${adminId}/suspend`, { token, body: {} });
  assert.equal(noOtp.status, 401, JSON.stringify(noOtp.data));

  // Avec OTP valide (purpose SUPER_CONFIRM) → OK.
  const code = await requestOtp(SA_EMAIL, 'SUPER_CONFIRM');
  const ok = await api('POST', `/api/super-admin/admins/${adminId}/suspend`, {
    token, body: { confirm_otp: code }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.admin.status, 'SUSPENDED');

  // L'admin suspendu apparaît bien SUSPENDED dans la liste.
  const list = await api('GET', '/api/super-admin/admins', { token });
  const suspended = list.data.admins.find((a) => a.id === adminId);
  assert.equal(suspended.status, 'SUSPENDED');
});

test('SA: le SUPER_ADMIN gère les permissions (grant + read + revoke)', async () => {
  const token = await saToken();
  const list = await api('GET', '/api/super-admin/permissions', { token });
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.ok(Array.isArray(list.data.roles));
  assert.ok(list.data.permissions.some((p) => p.code === 'super_admin.manage_admins'), 'permission super_admin présente');

  // Accorder fleet.manage au rôle CLIENT (test de non-régression).
  const grant = await api('POST', '/api/super-admin/permissions/role/CLIENT', {
    token, body: { permission_code: 'fleet.manage', confirm_password: SA_PASS }
  });
  assert.equal(grant.status, 200, JSON.stringify(grant.data));

  const rolePerms = await api('GET', '/api/super-admin/permissions/role/CLIENT', { token });
  assert.equal(rolePerms.status, 200, JSON.stringify(rolePerms.data));
  const perm = rolePerms.data.permissions.find((p) => p.code === 'fleet.manage');
  assert.ok(perm, 'permission fleet.manage accordée au CLIENT');

  // Retirer.
  const revoke = await api('POST', `/api/super-admin/permissions/role/CLIENT/revoke`, {
    token, body: { permission_id: perm.id, confirm_password: SA_PASS }
  });
  assert.equal(revoke.status, 200, JSON.stringify(revoke.data));

  const after = await api('GET', '/api/super-admin/permissions/role/CLIENT', { token });
  assert.ok(!after.data.permissions.some((p) => p.code === 'fleet.manage'), 'permission retirée');
});

test('SA: le SUPER_ADMIN gère les pays (create/lire/patch/désactive)', async () => {
  const token = await saToken();
  const code = 'Z' + rand().toUpperCase();
  const list = await api('GET', '/api/super-admin/countries', { token });
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.ok(list.data.countries.some((c) => c.code === 'BJ'), 'Bénin présent');

  // Créer un pays test (avec confirmation).
  const created = await api('POST', '/api/super-admin/countries', {
    token, body: { code, name: 'Testland', name_fr: 'Testland', region: 'TEST', currency_code: 'XOF', confirm_password: SA_PASS }
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  const patch = await api('PATCH', `/api/super-admin/countries/${code}`, {
    token, body: { name: 'Testland Deux', confirm_password: SA_PASS }
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.data));
  assert.equal(patch.data.country.name, 'Testland Deux');

  const disabled = await api('POST', `/api/super-admin/countries/${code}/disable`, {
    token, body: { confirm_password: SA_PASS }
  });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.data));
  assert.equal(disabled.data.country.is_active, false);
});

test('SA: le SUPER_ADMIN gère les devises', async () => {
  const token = await saToken();
  const code = 'Z' + rand().toUpperCase().slice(0, 2) + 'Z';
  const list = await api('GET', '/api/super-admin/currencies', { token });
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.ok(list.data.currencies.some((c) => c.code === 'XOF'));

  const created = await api('POST', '/api/super-admin/currencies', {
    token, body: { code, name: 'Zzz', symbol: 'Z', decimals: 2, confirm_password: SA_PASS }
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  const patch = await api('PATCH', `/api/super-admin/currencies/${code}`, {
    token, body: { decimals: 0, confirm_password: SA_PASS }
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.data));
  assert.equal(patch.data.currency.decimals, 0);
});

test('SA: le SUPER_ADMIN gère les intégrations', async () => {
  const token = await saToken();
  const code = 'test_' + rand();
  const list = await api('GET', '/api/super-admin/integrations', { token });
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.ok(list.data.integrations.some((i) => i.code === 'sms_provider'));

  const created = await api('POST', '/api/super-admin/integrations', {
    token, body: { code, name: 'Test Provider', type: 'OTHER', confirm_password: SA_PASS }
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));

  const patch = await api('PATCH', `/api/super-admin/integrations/${code}`, {
    token, body: { is_active: true, confirm_password: SA_PASS }
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.data));
  assert.equal(patch.data.integration.is_active, true);

  const del = await api('POST', `/api/super-admin/integrations/${code}/remove`, {
    token, body: { confirm_password: SA_PASS }
  });
  assert.equal(del.status, 200, JSON.stringify(del.data));
});

test('SA: le SUPER_ADMIN modifie un paramètre critique', async () => {
  const token = await saToken();
  const list = await api('GET', '/api/super-admin/settings/critical', { token });
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.ok(list.data.settings.some((s) => s.key === 'fees.commission_rate'));

  const cur = list.data.settings.find((s) => s.key === 'fees.commission_rate').value;

  const patch = await api('PATCH', '/api/super-admin/settings/critical', {
    token, body: { entries: [{ key: 'fees.commission_rate', value: '12.5', type: 'number' }], confirm_password: SA_PASS }
  });
  assert.equal(patch.status, 200, JSON.stringify(patch.data));

  const after = await api('GET', '/api/super-admin/settings/critical', { token });
  assert.equal(after.data.settings.find((s) => s.key === 'fees.commission_rate').value, '12.5');

  // Restauration.
  await api('PATCH', '/api/super-admin/settings/critical', {
    token, body: { entries: [{ key: 'fees.commission_rate', value: cur, type: 'number' }], confirm_password: SA_PASS }
  });
});

test('SA: le SUPER_ADMIN consulte le journal d audit enrichi', async () => {
  const token = await saToken();
  const r = await api('GET', '/api/super-admin/audit', { token });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(Array.isArray(r.data.logs));
  assert.ok('summary' in r.data);
  // Les mutations précédentes ont généré des logs super.*.
  const hasSuper = r.data.logs.some((l) => String(l.action).startsWith('super.'));
  assert.ok(hasSuper, 'au moins un log super.*');

  const filtered = await api('GET', '/api/super-admin/audit?action=super.settings.update', { token });
  assert.equal(filtered.status, 200, JSON.stringify(filtered.data));
  assert.ok(filtered.data.logs.every((l) => l.action === 'super.settings.update'), 'filtre par action');
});
