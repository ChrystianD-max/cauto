const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BASE } = require('./helpers');

// Appels bruts (headers de réponse nécessaires au test CORS — le helper api()
// ne les renvoie pas).
function raw(method, path, { origin, token } = {}) {
  return new Promise((resolve) => {
    const req = require('https').request(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(origin ? { Origin: origin } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      }
    }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { b += d; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', (e) => resolve({ status: -1, headers: {}, error: String(e) }));
    req.end();
  });
}

test('DOMAINES: les origines CORS deployeees sont acceptees (ACAO reflechie)', async () => {
  const origins = [
    'https://cauto.test',
    'https://www.cauto.test',
    'https://app.cauto.test',
    'https://api.cauto.test',
    'https://admin.cauto.test'
  ];
  for (const origin of origins) {
    const r = await raw('GET', '/api/config', { origin });
    assert.equal(r.status, 200, `GET /api/config depuis ${origin}`);
    const acao = r.headers['access-control-allow-origin'];
    assert.ok(acao, `${origin}: en-tete A-C-A-O absent`);
    assert.equal(acao, origin, `${origin}: A-C-A-O ne reflete pas l'origine`);
  }
});

test('DOMAINES: une origine inconnue est refusee (pas de ACAO)', async () => {
  const r = await raw('GET', '/api/config', { origin: 'https://evil.example.com' });
  assert.equal(r.status, 200); // l'API ne se bloque pas, mais :
  assert.equal(r.headers['access-control-allow-origin'], undefined, 'ACAO ne doit pas etre renvoye');
});

test('DOMAINES: requete same-origin (aucun Origin) non affectee', async () => {
  const r = await raw('GET', '/api/config');
  assert.equal(r.status, 200);
  assert.equal(r.headers['access-control-allow-origin'], undefined);
});

// Preflight CORS (OPTIONS) avec access-control-request-method.
test('DOMAINES: preflight OPTIONS pour une origine autorisee -> 204 + ACAO', async () => {
  const r = await raw('OPTIONS', '/api/config', { origin: 'https://app.cauto.test' });
  assert.ok([200, 204].includes(r.status), `status preflight ${r.status}`);
  assert.equal(r.headers['access-control-allow-origin'], 'https://app.cauto.test');
});