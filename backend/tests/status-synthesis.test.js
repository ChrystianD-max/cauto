// MODULE 86 — Statuts pièces + synthèse des profils.
//   • Professionnel qui modifie son profil → verification_status=PENDING + synthèse.
//   • Fournisseur qui modifie sa boutique → verification_status=PENDING + synthèse.
//   • Pièce créée en brouillon (DRAFT) → absente du catalogue, modifiable, publish.
//   • PATCH pièce met à jour la synthèse.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, login } = require('./helpers');

const PRO = 'garage.auto@cauto.local';

function uniqRef() { return 'REF-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6); }

async function newSupplier() { return register({ role: 'SUPPLIER' }); }
async function createBoutique(token, name) {
  return api('POST', '/api/suppliers', { token,
    body: { name: name || 'Pieces Auto ' + Date.now().toString(36), contact_name: 'Contact', email: 'c' + Date.now().toString(36) + '@x.bj', phone: '+22997010010', address: 'Cotonou', description: 'test' } });
}

test('PRO: modifier le profil → verification_status=PENDING + synthèse générée', async () => {
  const p = await login(PRO);
  const before = await api('GET', '/api/professionals/me', { token: p.token });
  assert.equal(before.status, 200);
  const id = before.data.professional.id;

  const upd = await api('PATCH', '/api/professionals/me', { token: p.token, body: { city: 'Cotonou 2', specialty: 'DIAGNOSTIC', is_available: true } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.professional.verification_status, 'PENDING', 'statut remis en attente');
  assert.ok(upd.data.professional.synthesis, 'synthèse générée');
  assert.equal(upd.data.professional.synthesis.city, 'Cotonou 2');
  assert.equal(upd.data.professional.synthesis.specialty, 'DIAGNOSTIC');
  assert.ok(upd.data.professional.synthesis.name, 'nom dans la synthèse');
});

test('PRO: logo_url (photo) accepté via PATCH /me', async () => {
  const p = await login(PRO);
  const upd = await api('PATCH', '/api/professionals/me', { token: p.token, body: { logo_url: '00000000-0000-0000-0000-0000000000aa' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.professional.logo_url, '00000000-0000-0000-0000-0000000000aa');
  assert.equal(upd.data.professional.verification_status, 'PENDING');
});

test('SUPPLIER: modifier la boutique → verification_status=PENDING + synthèse', async () => {
  const s = await newSupplier();
  await createBoutique(s.token);
  const upd = await api('PATCH', '/api/suppliers/mine', { token: s.token, body: { description: 'Nouvelle description boutique' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.supplier.verification_status, 'PENDING', 'boutique en attente');
  assert.ok(upd.data.supplier.synthesis, 'synthèse boutique générée');
  assert.equal(upd.data.supplier.synthesis.description, 'Nouvelle description boutique');
});

test('PIECE: crée en brouillon (DRAFT) → absente du catalogue, modifiable, publication', async () => {
  const s = await newSupplier();
  await createBoutique(s.token);
  const ref = uniqRef();
  const created = await api('POST', '/api/parts', { token: s.token, body: { reference: ref, name: 'Brouillon disque', unit_price_cents: 5000, stock_quantity: 5, status: 'DRAFT' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.part.status, 'DRAFT');
  assert.ok(created.data.part.synthesis, 'synthèse pièce créée');
  assert.equal(created.data.part.synthesis.name, 'Brouillon disque');

  const list = await api('GET', '/api/parts?q=' + encodeURIComponent('Brouillon disque'), { token: s.token });
  assert.ok(!list.data.parts.some(x => x.id === created.data.part.id), 'brouillon invisible dans le catalogue');

  const mod = await api('PATCH', '/api/parts/' + created.data.part.id, { token: s.token, body: { name: 'Disque ventilé', status: 'ACTIVE' } });
  assert.equal(mod.status, 200);
  assert.equal(mod.data.part.status, 'ACTIVE');
  assert.equal(mod.data.part.synthesis.name, 'Disque ventilé', 'synthèse mise à jour');

  const pub = await api('GET', '/api/parts?q=' + encodeURIComponent('Disque ventilé'), { token: s.token });
  assert.ok(pub.data.parts.some(x => x.id === created.data.part.id), 'pièce publiée visible');
});

test('PIECE: défaut = DRAFT (ne part pas directement en ligne)', async () => {
  const s = await newSupplier();
  await createBoutique(s.token);
  const ref = uniqRef();
  const created = await api('POST', '/api/parts', { token: s.token, body: { reference: ref, name: 'Pièce par défaut', unit_price_cents: 1000, stock_quantity: 1 } });
  assert.equal(created.status, 201);
  assert.equal(created.data.part.status, 'DRAFT', 'sans statut : reste en brouillon');
});
