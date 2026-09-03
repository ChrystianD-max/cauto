const https = require('https');
const crypto = require('crypto');
const { Client } = require('pg');

const BASE = process.env.TEST_API_BASE || 'https://localhost';
// Capturé À L'IMPORT : dotenv (chargé via les modules backend) réécrit plus tard
// DATABASE_URL vers l'hôte docker 'postgres', inutilisable depuis l'hôte.
const PG_URL = process.env.TEST_PG_URL || 'postgresql://cauto:cauto@localhost:5432/cauto';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const PASS = 'Test1234!';

function api(method, path, { token, body, headers = {} } = {}) {
  return new Promise((resolve) => {
    const req = https.request(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...headers
      }
    }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { b += d; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(b); } catch { /* non-JSON body */ }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', (e) => resolve({ status: -1, data: String(e) }));
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

const rand = () => crypto.randomBytes(4).toString('hex');

const uniqPlate = () => 'T' + rand().toUpperCase().slice(0, 8);
const uniqVin = () => {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let v = '';
  for (let i = 0; i < 17; i++) v += chars[crypto.randomInt(chars.length)];
  return v;
};
const uniqEmail = () => 't' + Date.now().toString(36) + rand() + '@cauto.test';

async function register({ name, role = 'CLIENT' } = {}) {
  const r = await api('POST', '/api/auth/register', {
    body: { name: name || 'Testeur Auto', email: uniqEmail(), phone: '+22997000000', password: PASS, role }
  });
  if (r.status !== 201) throw new Error(`register échoué ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function login(email, password = PASS) {
  const r = await api('POST', '/api/auth/login', { body: { email, password } });
  if (r.status !== 200) throw new Error(`login échoué ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function proToken(proEmail = 'garage.auto@cauto.local') {
  const l = await login(proEmail);
  return l.token;
}

async function myProfessionalId(token) {
  const r = await api('GET', '/api/professionals/me', { token });
  if (r.status !== 200) throw new Error(`professionals/me ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data.professional.id;
}

async function createVehicle(token, { make = 'Toyota', model = 'Corolla', mileage = 50000 } = {}) {
  const r = await api('POST', '/api/vehicles', {
    token,
    body: {
      make, model, year: 2018, plate: uniqPlate(), vin: uniqVin(), mileage,
      fuel_type: 'ESSENCE', gearbox: 'MANUELLE', transmission: 'TWD'
    }
  });
  if (r.status !== 201) throw new Error(`véhicule échoué ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data.vehicle;
}

async function createServiceRequest(token, { vehicle_id, urgency = 'NORMAL', description } = {}) {
  const r = await api('POST', '/api/service-requests', {
    token,
    body: {
      vehicle_id,
      problem_description: description || 'Bruit de roulement à l avant du véhicule au freinage',
      category: 'Mecanique',
      urgency
    }
  });
  if (r.status !== 200) throw new Error(`service-request ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data.service_request;
}

async function ensureAdminRole() {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  try {
    await pg.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM users u JOIN roles r ON r.code = u.role::text
      WHERE u.email = 'admin.demo@cauto.local' AND r.code = 'ADMIN'
      ON CONFLICT (user_id, role_id) DO NOTHING`);
  } finally {
    await pg.end();
  }
}

async function pgQuery(text, params = []) {
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  try {
    const res = await pg.query(text, params);
    return res.rows;
  } finally {
    await pg.end();
  }
}

// Monte un scénario complet jusqu'à un état donné.
// stage : 'quote' (devis créé, non décidé) | 'repairing' (ordre de réparation ouvert)
//       | 'closed' (intervention CLOSED)
async function buildJourney({ stage = 'closed', clientRole = 'CLIENT' } = {}) {
  const client = await register({ role: clientRole });
  const vehicle = await createVehicle(client.token, { mileage: 50000 });
  const sr = await createServiceRequest(client.token, { vehicle_id: vehicle.id });
  const srId = sr.id;

  const match = await api('POST', `/api/service-requests/${srId}/match`, { token: client.token, body: {} });
  if (match.status !== 200) throw new Error(`match ${match.status}: ${JSON.stringify(match.data)}`);

  const pro = await proToken();
  const proId = await myProfessionalId(pro);

  const sel = await api('POST', `/api/service-requests/${srId}/select`, { token: client.token, body: { professional_id: proId } });
  if (sel.status !== 200) throw new Error(`select ${sel.status}: ${JSON.stringify(sel.data)}`);

  const acc = await api('POST', `/api/service-requests/${srId}/accept`, {
    token: pro,
    body: { scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }
  });
  if (acc.status !== 200) throw new Error(`accept ${acc.status}: ${JSON.stringify(acc.data)}`);

  const rec = await api('POST', `/api/service-requests/${srId}/reception`, {
    token: pro,
    body: { vin: vehicle.vin, mileage: 50000, fuel_level: '50%', exterior: 'OK', interior: 'OK', observations: 'Aucune', keys_provided: true }
  });
  if (rec.status !== 200) throw new Error(`reception ${rec.status}: ${JSON.stringify(rec.data)}`);

  const vrec = await api('POST', `/api/service-requests/${srId}/validate-reception`, { token: client.token, body: {} });
  if (vrec.status !== 200) throw new Error(`validate-reception ${vrec.status}: ${JSON.stringify(vrec.data)}`);

  const start = await api('POST', `/api/service-requests/${srId}/start-diagnosis`, { token: pro, body: {} });
  if (start.status !== 200) throw new Error(`start-diagnosis ${start.status}: ${JSON.stringify(start.data)}`);
  const interventionId = start.data.service_request.intervention_id;

  const diag = await api('POST', `/api/interventions/${interventionId}/diagnostic`, {
    token: pro,
    body: { content: 'Diagnostic automatisé : plaquettes avant usées, remplacement nécessaire.' }
  });
  if (![200, 201].includes(diag.status)) throw new Error(`diagnostic ${diag.status}: ${JSON.stringify(diag.data)}`);

  const quote = await api('POST', '/api/quotes', {
    token: pro,
    body: {
      intervention_id: interventionId,
      items: [
        { label: 'Plaquettes avant', kind: 'PARTS', qty: 1, unit_price_cents: 15000 },
        { label: 'Main d oeuvre', kind: 'LABOR', qty: 2, unit_price_cents: 8000 }
      ],
      delay_days: 2,
      warranty_months: 12
    }
  });
  if (quote.status !== 200) throw new Error(`quote ${quote.status}: ${JSON.stringify(quote.data)}`);
  const quoteId = quote.data.quote.id;

  const sent = await api('POST', `/api/repairs/${interventionId}/status`, { token: pro, body: { status: 'QUOTE_SENT' } });
  if (sent.status !== 200) throw new Error(`status QUOTE_SENT ${sent.status}: ${JSON.stringify(sent.data)}`);

  if (stage === 'quote') {
    return { client, pro, proId, vehicle, srId, interventionId, quoteId };
  }

  const appr = await api('POST', `/api/quotes/${quoteId}/approve`, { token: client.token, body: {} });
  if (appr.status !== 200) throw new Error(`approve ${appr.status}: ${JSON.stringify(appr.data)}`);

  const qa = await api('POST', `/api/repairs/${interventionId}/status`, { token: pro, body: { status: 'QUOTE_APPROVED' } });
  if (qa.status !== 200) throw new Error(`status QUOTE_APPROVED ${qa.status}: ${JSON.stringify(qa.data)}`);

  const order = await api('POST', `/api/interventions/${interventionId}/repair-order`, { token: pro, body: {} });
  if (order.status !== 201) throw new Error(`repair-order ${order.status}: ${JSON.stringify(order.data)}`);

  if (stage === 'repairing') {
    return { client, pro, proId, vehicle, srId, interventionId, quoteId };
  }

  const qc = await api('POST', `/api/repairs/${interventionId}/status`, { token: pro, body: { status: 'QUALITY_CHECK' } });
  if (qc.status !== 200) throw new Error(`status QUALITY_CHECK ${qc.status}: ${JSON.stringify(qc.data)}`);

  const qcResult = await api('POST', `/api/repairs/${interventionId}/quality-check`, {
    token: pro,
    body: { road_test_ok: true, result: 'OK', notes: 'Test routier concluant', odometer_km: 50100, replaced_parts: ['Plaquettes avant'] }
  });
  if (qcResult.status !== 200) throw new Error(`quality-check ${qcResult.status}: ${JSON.stringify(qcResult.data)}`);

  const conf = await api('POST', `/api/repairs/${interventionId}/client-confirm`, { token: client.token, body: { received_ok: true } });
  if (conf.status !== 200) throw new Error(`client-confirm ${conf.status}: ${JSON.stringify(conf.data)}`);

  return { client, pro, proId, vehicle, srId, interventionId, quoteId };
}

module.exports = {
  BASE, PASS, api, register, login, proToken, myProfessionalId,
  createVehicle, createServiceRequest, buildJourney,
  ensureAdminRole, pgQuery, uniqEmail, uniqPlate, uniqVin
};