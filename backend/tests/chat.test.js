// Tests messagerie "comme WhatsApp" : accusés de lecture, pièces jointes
// (médias), notes vocales, et image de pièce fournisseur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { api, register } = require('./helpers');

const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// Rappel : magic bytes du container WebM (audio/webm side).
const WEBM_AUDIO = Buffer.concat([Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x00, 0x00, 0x00, 0x00, 0x00]), Buffer.from('Notes vocales de test')]);

async function upload(path, { token, fields, file }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields || {})) fd.append(k, v);
  fd.append('file', new Blob([file.buffer], { type: file.type }), file.name);
  const res = await fetch('https://localhost' + path, {
    method: 'POST',
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    body: fd
  });
  let data = null;
  try { data = await res.json(); } catch { /* corps non JSON */ }
  return { status: res.status, data };
}

async function fetchDoc(token, docId) {
  const res = await fetch('https://localhost/api/documents/' + docId + '/download?view=1', {
    headers: token ? { Authorization: 'Bearer ' + token } : {}
  });
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
}

async function newConv(aToken, bId) {
  const r = await api('POST', '/api/chat/conversations', { token: aToken, body: { participant_ids: [bId] } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.conversation.id;
}

async function convBetween(a, b) {
  // Réutilise l'existant OU en rejette le flux : nettoie par unique conv id.
  const r = await api('POST', '/api/chat/conversations', { token: a.token, body: { participant_ids: [b.user.id] } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.conversation.id;
}

test('CHAT: accusé de lecture — envoyé -> délivré -> lu (pastilles)', async () => {
  const a = await register({ role: 'CLIENT' });
  const b = await register({ role: 'CLIENT' });
  const convId = await convBetween(a, b);

  const sent = await api('POST', `/api/chat/conversations/${convId}/messages`, { token: a.token, body: { body: 'Bonjour C-AUTO' } });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  assert.equal(sent.data.message.sender_name !== undefined, true);
  assert.deepEqual(sent.data.message.attachments, []);
  assert.equal(sent.data.message.read_at, null);
  assert.equal(sent.data.message.delivered_at, null);

  // L'émetteur refetch : délivré (le GET marque delivered_at), pas encore lu (c'est son propre message).
  const ga = await api('GET', `/api/chat/conversations/${convId}/messages`, { token: a.token });
  assert.equal(ga.status, 200);
  const own = ga.data.messages.find(m => m.id === sent.data.message.id);
  assert.ok(own.delivered_at, 'délivré après refetch');
  assert.equal(own.read_at, null);

  // Le destinataire lit : le message de l'émetteur passe lu.
  const gb = await api('GET', `/api/chat/conversations/${convId}/messages`, { token: b.token });
  assert.equal(gb.status, 200);
  const read = gb.data.messages.find(m => m.id === sent.data.message.id);
  assert.ok(read.read_at, 'lu après lecture par le destinataire');
  assert.ok(read.attachments.length === 0);

  // L'émetteur revoit : pastille bleue (read_at renvoyé).
  const ga2 = await api('GET', `/api/chat/conversations/${convId}/messages`, { token: a.token });
  const own2 = ga2.data.messages.find(m => m.id === sent.data.message.id);
  assert.ok(own2.read_at, 'émetteur voit la pastille bleue');

  // Liste des conversations : dernier message exposé.
  const list = await api('GET', '/api/chat/conversations', { token: a.token });
  assert.equal(list.status, 200);
  const conv = list.data.conversations.find(c => c.id === convId);
  assert.ok(conv && conv.last_message, 'liste expose last_message');
  assert.equal(conv.last_message.attachment_kind, null);
  assert.equal(conv.last_message.body, 'Bonjour C-AUTO');
});

test('CHAT: pièce jointe image — partagée aux membres, refusée aux non-membres', async () => {
  const a = await register({ role: 'CLIENT' });
  const b = await register({ role: 'CLIENT' });
  const c = await register({ role: 'CLIENT' });
  const convId = await convBetween(a, b);

  const up = await upload(`/api/chat/conversations/${convId}/attachments`, {
    token: a.token,
    fields: { kind: 'IMAGE' },
    file: { buffer: PIXEL_PNG, type: 'image/png', name: 'photo-catalogue.png' }
  });
  assert.equal(up.status, 201, JSON.stringify(up.data));
  const msg = up.data.message;
  assert.equal(msg.attachments.length, 1);
  assert.equal(msg.attachments[0].kind, 'IMAGE');
  assert.equal(msg.attachments[0].mime, 'image/png');
  const docId = msg.attachments[0].id;

  // Visible par le membre B.
  const gb = await api('GET', `/api/chat/conversations/${convId}/messages`, { token: b.token });
  const theirs = gb.data.messages.find(m => m.id === msg.id);
  assert.ok(theirs && theirs.attachments.length === 1, 'le destinaire voit la pièce jointe');
  const dlB = await fetchDoc(b.token, docId);
  assert.equal(dlB.status, 200, 'le membre télécharge le média');
  assert.ok(dlB.body.length > 0);

  // Refusé à un tiers (pas membre de la conversation).
  const dlC = await fetchDoc(c.token, docId);
  assert.equal(dlC.status, 403, 'un non-membre ne lit pas le média privé');

  // Téléchargement public sans token : réservé aux docs visibility=public.
  const pub = await upload('/api/documents', {
    token: a.token,
    fields: { category: 'PHOTO', visibility: 'public', name: 'Public Demo' },
    file: { buffer: PIXEL_PNG, type: 'image/png', name: 'public.png' }
  });
  assert.equal(pub.status, 201, JSON.stringify(pub.data));
  const pubGet = await fetch('https://localhost/api/documents/' + pub.data.document.id + '/public');
  assert.equal(pubGet.status, 200);

  // Une note vocale audio est acceptée.
  const aud = await upload(`/api/chat/conversations/${convId}/attachments`, {
    token: a.token,
    fields: { kind: 'AUDIO', body: 'Voici ma note' },
    file: { buffer: WEBM_AUDIO, type: 'audio/webm', name: 'note.webm' }
  });
  assert.equal(aud.status, 201, JSON.stringify(aud.data));
  assert.equal(aud.data.message.attachments[0].kind, 'AUDIO');

  // Type de média inconnu rejeté avant stockage.
  const bad = await upload(`/api/chat/conversations/${convId}/attachments`, {
    token: a.token,
    fields: { kind: 'WAT' },
    file: { buffer: PIXEL_PNG, type: 'image/png', name: 'x.png' }
  });
  assert.equal(bad.status, 400);

  // Anti-polyglot : un png déclaré en audio est rejeté.
  const spoof = await upload(`/api/chat/conversations/${convId}/attachments`, {
    token: a.token,
    fields: { kind: 'AUDIO' },
    file: { buffer: PIXEL_PNG, type: 'audio/webm', name: 'spoof.webm' }
  });
  assert.equal(spoof.status, 415);
});

test('PARTS: image de pièce — upload public, référencement, nettoyage', async () => {
  const s = await register({ role: 'SUPPLIER' });
  const boutique = await api('POST', '/api/suppliers', {
    token: s.token,
    body: { name: 'Pièces Image ' + Date.now().toString(36), contact_name: 'Contact', email: 'b'+Date.now()+'@cauto.test', phone: '+22997002020', address: 'Cotonou', description: 'Test image pièce' }
  });
  assert.equal(boutique.status, 201, JSON.stringify(boutique.data));

  const img = await upload('/api/documents', {
    token: s.token,
    fields: { category: 'PHOTO', visibility: 'public', name: 'Photo plaquette' },
    file: { buffer: PIXEL_PNG, type: 'image/png', name: 'plaquette.png' }
  });
  assert.equal(img.status, 201, JSON.stringify(img.data));
  const docId = img.data.document.id;

  const ref = 'REF-IMG-' + Date.now().toString(36).toUpperCase();
  const part = await api('POST', '/api/parts', {
    token: s.token,
    body: { reference: ref, name: 'Plaquette à disque', brand: 'BREMBO', category: 'PREMIUM', description: 'Avec photo', unit_price_cents: 4500, stock_quantity: 10, min_stock: 2, image_doc_id: docId, status: 'ACTIVE' }
  });
  assert.equal(part.status, 201, JSON.stringify(part.data));
  assert.equal(part.data.part.image_doc_id, docId, 'pièce liée à son image');

  // Le client voit la pièce et son image dans le catalogue (détail + liste).
  const client = await register({ role: 'CLIENT' });
  const det = await api('GET', '/api/parts/' + part.data.part.id, { token: client.token });
  assert.equal(det.status, 200);
  assert.equal(det.data.part.image_doc_id, docId);
  const list = await api('GET', '/api/parts?q=' + encodeURIComponent(ref), { token: client.token });
  assert.equal(list.status, 200);
  const found = list.data.parts.find(p => p.id === part.data.part.id);
  assert.ok(found, 'pièce dans le catalogue client');
  assert.equal(found.image_doc_id, docId, 'la liste expose l\'image publique');
  assert.equal(found.supplier_name !== undefined, true);

  // L'image publique se télécharge en lecture directe (vignette <img>).
  const pubGet = await fetch('https://localhost/api/documents/' + docId + '/public');
  assert.equal(pubGet.status, 200);

  // Suppression : image_doc_id remis à null via PATCH.
  const cls = await api('PATCH', '/api/parts/' + part.data.part.id, { token: s.token, body: { image_doc_id: null } });
  assert.equal(cls.status, 200);
  assert.equal(cls.data.part.image_doc_id, null);

  // Image inexistante -> 400.
  const fake = await api('POST', '/api/parts', {
    token: s.token,
    body: { reference: ref + '-X', name: 'Pièce falsifiée', unit_price_cents: 1000, stock_quantity: 1, image_doc_id: crypto.randomUUID() }
  });
  assert.equal(fake.status, 400);
});