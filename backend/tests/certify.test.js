const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, login, ensureAdminRole, uniqEmail } = require('./helpers');

const PASS = 'Test1234!';
const ADM = 'admin.demo@cauto.local';

async function newGarage(name) {
  const email = uniqEmail();
  const r = await api('POST', '/api/auth/register', {
    body: { name: name || 'Garage Certif', email, phone: '+22997000000', password: PASS, role: 'GARAGE', garage_name: name || 'Garage Certif SARL' }
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { ...r.data, email };
}

async function adminLogin() {
  await ensureAdminRole();
  const l = await login(ADM);
  return l.token;
}

async function findPro(adminToken, q) {
  const r = await api('GET', '/api/admin/professionals?q=' + encodeURIComponent(q), { token: adminToken });
  assert.equal(r.status, 200);
  const found = (r.data.professionals || []).find(p => p.professional_name === q || String(p.professional_name).includes(String(q).slice(0, 12)));
  assert.ok(found, 'professionnel introuvable pour ' + q);
  return found;
}

test('CERTIF: badge bleu — admin certifie un garage, visible pour le pro et les clients', async () => {
  const admin = await adminLogin();
  const garage = await newGarage('Garage Badge ' + Date.now().toString(36));
  const proMe = await api('GET', '/api/auth/me', { token: garage.token });
  assert.equal(proMe.status, 200);
  assert.equal(proMe.data.user.is_certified, false, 'pas encore certifié');

  const proRec = await api('GET', '/api/professionals/me', { token: garage.token });
  assert.equal(proRec.status, 200);
  const proId = proRec.data.professional.id;

  const deny = await api('PATCH', '/api/admin/professionals/' + proId + '/certify', { token: admin, body: { certified: true } });
  assert.equal(deny.status, 200);
  assert.equal(deny.data.professional.is_certified, true);

  const meAgain = await api('GET', '/api/auth/me', { token: garage.token });
  assert.equal(meAgain.data.user.is_certified, true, '/me reflète la certification');

  const relogin = await login(garage.email);
  assert.equal(relogin.user.is_certified, true, 'login renvoie is_certified');

  const client = await register({ role: 'CLIENT' });
  const list = await api('GET', '/api/professionals?q=' + encodeURIComponent(garage.user.name), { token: client.token });
  assert.equal(list.status, 200);
  const inList = (list.data.professionals || []).find(p => (p.name || '') === garage.user.name);
  assert.ok(inList, 'garage présent dans l`annuaire client');
  assert.equal(inList.is_certified, true, 'annuaire client expose is_certified');

  const det = await api('GET', '/api/professionals/' + proId, { token: client.token });
  assert.equal(det.status, 200);
  assert.equal(det.data.professional.is_certified, true, 'fiche client expose is_certified');
});

test('CERTIF: retrait de certification par l`admin', async () => {
  const admin = await adminLogin();
  const garage = await newGarage('Garage Retour ' + Date.now().toString(36));
  const proRec = await api('GET', '/api/professionals/me', { token: garage.token });
  const proId = proRec.data.professional.id;

  const give = await api('PATCH', '/api/admin/professionals/' + proId + '/certify', { token: admin, body: { certified: true } });
  assert.equal(give.data.professional.is_certified, true);
  const take = await api('PATCH', '/api/admin/professionals/' + proId + '/certify', { token: admin, body: { certified: false } });
  assert.equal(take.data.professional.is_certified, false);

  const me = await api('GET', '/api/auth/me', { token: garage.token });
  assert.equal(me.data.user.is_certified, false);
});