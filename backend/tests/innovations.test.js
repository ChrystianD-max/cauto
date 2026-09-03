// MODULE 87 — INNOVATIONS C-AUTO (7 fonctionnalités).
// Tests pour : avis photo/vidéo vérifiés, rappels maintenance proactifs,
// SOS dépannage localisé, forfaits d'entretien, passeport QR,
// recharge électrique, estimation valeur de revente.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, login, createVehicle, buildJourney, proToken, myProfessionalId, pgQuery } = require('./helpers');

const CLIENT_EMAIL = 'client.demo@cauto.local';
const PRO_EMAIL = 'garage.auto@cauto.local';

async function clientLogin() { return login(CLIENT_EMAIL); }
async function proLogin() { return login(PRO_EMAIL); }

// ---------- #1 Avis photo/vidéo vérifiés ----------

test('#1 avis media: ajouter photo à un avis', async () => {
  const { token } = await clientLogin();
  const pro = await proToken();
  const { client, interventionId } = await buildJourney({ stage: 'closed' });

  const rate = await api('POST', '/api/reviews', { token: client.token, body: {
    intervention_id: interventionId,
    professional_id: await myProfessionalId(pro),
    overall_stars: 5, comment: 'Excellent travail'
  }});
  assert.equal(rate.status, 200);
  const ratingId = rate.data.rating.id;

  const media = await api('POST', `/api/innovations/reviews/${ratingId}/media`, { token: client.token, body: {
    type: 'PHOTO', url: 'https://cdn.cauto.bj/photos/received_123.jpg', caption: 'Plaquettes neuves'
  }});
  assert.equal(media.status, 200);
  assert.ok(Array.isArray(media.data.media));
  assert.equal(media.data.media.length, 1);
  assert.equal(media.data.media[0].type, 'PHOTO');
  assert.equal(media.data.media[0].url, 'https://cdn.cauto.bj/photos/received_123.jpg');
});

test('#1 avis media: détail avis contient média + badge vérifié', async () => {
  const { token } = await clientLogin();
  const pro = await proToken();
  const { client, interventionId } = await buildJourney({ stage: 'closed' });

  const rate = await api('POST', '/api/reviews', { token: client.token, body: {
    intervention_id: interventionId,
    professional_id: await myProfessionalId(pro),
    overall_stars: 4, comment: 'Bien'
  }});
  const ratingId = rate.data.rating.id;
  await api('POST', `/api/innovations/reviews/${ratingId}/media`, { token: client.token, body: {
    type: 'VIDEO', url: 'https://cdn.cauto.bj/videos/clip.mp4'
  }});

  const detail = await api('GET', `/api/innovations/reviews/${ratingId}`, { token });
  assert.equal(detail.status, 200);
  assert.ok(Array.isArray(detail.data.rating.media));
  assert.equal(detail.data.rating.media[0].type, 'VIDEO');
  assert.equal(detail.data.rating.verified, false, 'pas encore vérifié');
});

test('#1 avis media: vérification avec intervention CLOSED', async () => {
  const { token } = await clientLogin();
  const pro = await proToken();
  const { client, interventionId } = await buildJourney({ stage: 'closed' });

  const rate = await api('POST', '/api/reviews', { token: client.token, body: {
    intervention_id: interventionId,
    professional_id: await myProfessionalId(pro),
    overall_stars: 5, comment: 'Top'
  }});
  const ratingId = rate.data.rating.id;

  const verify = await api('POST', `/api/innovations/reviews/${ratingId}/verify`, { token: client.token, body: {} });
  assert.equal(verify.status, 200);
  assert.equal(verify.data.verified, true, 'intervention CLOSE → vérifié');
  assert.ok(verify.data.rating.verified_at, 'date de vérification présente');
});

test('#1 avis media: liste avis d\'un professionnel', async () => {
  const pro = await proToken();
  const proId = await myProfessionalId(pro);
  const { client, interventionId } = await buildJourney({ stage: 'closed' });

  await api('POST', '/api/reviews', { token: client.token, body: {
    intervention_id: interventionId, professional_id: proId, overall_stars: 5
  }});
  const list = await api('GET', `/api/innovations/reviews/professional/${proId}`, { token: client.token });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data.ratings));
  assert.ok(list.data.ratings.length >= 1);
});

// ---------- #5 Passeport auto partageable QR ----------

test('#5 passeport: créer un lien de partage', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token);

  const share = await api('POST', `/api/innovations/vehicle-insights/vehicles/${v.id}/passport/share`, {
    token, body: { purpose: 'Visite technique', expires_in_days: 30 }
  });
  assert.equal(share.status, 200);
  assert.ok(share.data.share.share_token);
  assert.ok(share.data.url.startsWith('/api/innovations/vehicle-insights/passport/view/'));
});

test('#5 passeport: accès public au lien', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token);

  const share = await api('POST', `/api/innovations/vehicle-insights/vehicles/${v.id}/passport/share`, {
    token, body: { purpose: 'Devis garage' }
  });
  const pubToken = share.data.share.share_token;

  const view = await api('GET', `/api/innovations/vehicle-insights/passport/view/${pubToken}`);
  assert.equal(view.status, 200);
  assert.equal(view.data.vehicle.make, 'Toyota');
  assert.equal(view.data.share.purpose, 'Devis garage');
});

test('#5 passeport: rejeter un token expiré', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token);

  const share = await api('POST', `/api/innovations/vehicle-insights/vehicles/${v.id}/passport/share`, {
    token, body: { expires_in_days: 1 }
  });
  // expirer manuellement
  await pgQuery('UPDATE vehicle_passport_shares SET expires_at = now() - interval \'1 hour\' WHERE id=$1',
    [share.data.share.id]);

  const view = await api('GET', `/api/innovations/vehicle-insights/passport/view/${share.data.share.share_token}`);
  assert.equal(view.status, 410);
});

test('#5 passeport: lister les partages d\'un véhicule', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token);
  await api('POST', `/api/innovations/vehicle-insights/vehicles/${v.id}/passport/share`, { token, body: {} });

  const list = await api('GET', `/api/innovations/vehicle-insights/vehicles/${v.id}/passport/shares`, { token });
  assert.equal(list.status, 200);
  assert.ok(list.data.shares.length >= 1);
});

test('#5 passeport: supprimer un lien de partage', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token);
  const share = await api('POST', `/api/innovations/vehicle-insights/vehicles/${v.id}/passport/share`, { token, body: {} });

  const del = await api('DELETE', `/api/innovations/vehicle-insights/passport/share/${share.data.share.id}`, { token });
  assert.equal(del.status, 200);
  assert.equal(del.data.success, true);
});

// ---------- #7 Estimation valeur de revente ----------

test('#7 estimation: retourne une estimation pour un véhicule', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token, { mileage: 80000, year: 2018 });

  const val = await api('GET', `/api/innovations/vehicle-insights/vehicles/${v.id}/valuation`, { token });
  assert.equal(val.status, 200);
  assert.ok(val.data.valuation.estimated_value_cents > 0);
  assert.ok(val.data.valuation.market_min_cents <= val.data.valuation.estimated_value_cents);
  assert.ok(val.data.valuation.market_max_cents >= val.data.valuation.estimated_value_cents);
  assert.ok(val.data.factors);
  assert.ok(val.data.factors.mileage === 80000);
});

test('#7 estimation: historique des estimations', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token);
  await api('GET', `/api/innovations/vehicle-insights/vehicles/${v.id}/valuation`, { token });
  await api('GET', `/api/innovations/vehicle-insights/vehicles/${v.id}/valuation`, { token });

  const hist = await api('GET', `/api/innovations/vehicle-insights/vehicles/${v.id}/valuation/history`, { token });
  assert.equal(hist.status, 200);
  assert.equal(hist.data.history.length, 1, 'une seule estimation (purge des anciennes)');
});

// ---------- #4 Forfaits d'entretien ----------

test('#4 forfaits: listing des plans disponibles (après seed)', async () => {
  await pgQuery(`INSERT INTO service_plans (code, name, tier, price_cents, period, emergency_towing, extended_warranty_months, priority_support)
    VALUES ('ESSENTIAL', 'Essentiel', 'SILVER', 50000, 'YEAR', false, 0, false),
           ('PREMIUM', 'Premium', 'GOLD', 150000, 'YEAR', true, 12, true)
    ON CONFLICT (code) DO NOTHING`);
  const { token } = await clientLogin();
  const plans = await api('GET', '/api/innovations/service-plans/plans', { token });
  assert.equal(plans.status, 200);
  assert.ok(plans.data.plans.length >= 2);
  assert.ok(plans.data.plans.some(p => p.code === 'PREMIUM'));
});

test('#4 forfaits: souscrire à un plan', async () => {
  await pgQuery(`INSERT INTO service_plans (code, name, tier, price_cents, period)
    VALUES ('TEST-BASIC', 'Test Basique', 'BRONZE', 25000, 'MONTH')
    ON CONFLICT (code) DO NOTHING`);
  const { token } = await register({ role: 'CLIENT' });
  const v = await createVehicle(token);

  const sub = await api('POST', '/api/innovations/service-plans/subscribe', { token, body: {
    plan_code: 'TEST-BASIC', vehicle_id: v.id
  }});
  assert.equal(sub.status, 200);
  assert.equal(sub.data.subscription.status, 'ACTIVE');
  assert.equal(sub.data.plan.code, 'TEST-BASIC');
});

test('#4 forfaits: vérifier couverture towing sur plan non couvert', async () => {
  await pgQuery(`INSERT INTO service_plans (code, name, price_cents, period, emergency_towing)
    VALUES ('TEST-NO-TOW', 'No Tow', 10000, 'MONTH', false)
    ON CONFLICT (code) DO NOTHING`);
  const { token } = await register({ role: 'CLIENT' });
  const v = await createVehicle(token);
  await api('POST', '/api/innovations/service-plans/subscribe', { token, body: {
    plan_code: 'TEST-NO-TOW', vehicle_id: v.id
  }});

  const check = await api('GET', `/api/innovations/service-plans/check/${v.id}/towing`, { token });
  assert.equal(check.status, 200);
  assert.equal(check.data.covered, false);
});

test('#4 forfaits: lister mes abonnements', async () => {
  const { token } = await clientLogin();
  const list = await api('GET', '/api/innovations/service-plans/subscriptions', { token });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data.subscriptions));
});

test('#4 forfaits: annuler un abonnement', async () => {
  await pgQuery(`INSERT INTO service_plans (code, name, price_cents, period) VALUES ('TEST-CANCEL', 'Cancel', 10000, 'MONTH') ON CONFLICT (code) DO NOTHING`);
  const { token } = await clientLogin();
  const v = await createVehicle(token);
  const sub = await api('POST', '/api/innovations/service-plans/subscribe', { token, body: {
    plan_code: 'TEST-CANCEL', vehicle_id: v.id
  }});

  const cancel = await api('POST', `/api/innovations/service-plans/subscriptions/${sub.data.subscription.id}/cancel`, { token, body: {} });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.success, true);
});

// ---------- #3 Assistance SOS ----------

test('#3 SOS: créer une demande SOS', async () => {
  await pgQuery(`UPDATE professionals SET latitude=6.3703, longitude=2.3912 WHERE id IN (SELECT id FROM professionals LIMIT 1)`);
  const { token } = await register({ role: 'CLIENT' });
  const v = await createVehicle(token);

  const sos = await api('POST', '/api/innovations/sos', { token, body: {
    vehicle_id: v.id, latitude: 6.3703, longitude: 2.3912,
    problem: 'Panne moteur sur la voie', radius_km: 50
  }});
  assert.equal(sos.status, 200);
  assert.ok(['ACTIVE', 'FOUND'].includes(sos.data.sos.status));
  assert.ok(Array.isArray(sos.data.matches));
  await api('POST', `/api/innovations/sos/${sos.data.sos.id}/cancel`, { token, body: {} });
});

test('#3 SOS: rejet double demande active', async () => {
  const { token } = await register({ role: 'CLIENT' });
  const v = await createVehicle(token);
  await api('POST', '/api/innovations/sos', { token, body: {
    latitude: 6.3703, longitude: 2.3912
  }});

  const dup = await api('POST', '/api/innovations/sos', { token, body: {
    latitude: 6.3703, longitude: 2.3912
  }});
  assert.equal(dup.status, 400);
});

test('#3 SOS: annuler une demande', async () => {
  const { token } = await register({ role: 'CLIENT' });
  const created = await api('POST', '/api/innovations/sos', { token, body: {
    latitude: 6.38, longitude: 2.40
  }});

  const cancel = await api('POST', `/api/innovations/sos/${created.data.sos.id}/cancel`, { token, body: {} });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.data.success, true);
});

test('#3 SOS: lister mes demandes SOS', async () => {
  const { token } = await register({ role: 'CLIENT' });
  const list = await api('GET', '/api/innovations/sos', { token });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data.sos_requests));
});

// ---------- #6 Recharge électrique ----------

test('#6 recharge: enregistrer une borne de recharge', async () => {
  const { token: adminToken } = await login('admin.demo@cauto.local');
  const station = await api('POST', '/api/innovations/eco-mobility/stations', { token: adminToken, body: {
    name: 'Station Cotonou Centre', latitude: 6.3658, longitude: 2.3854,
    city: 'Cotonou', connector_types: ['CCS2', 'Type2'], power_kw: 50, price_per_kwh_cents: 200
  }});
  assert.equal(station.status, 200);
  assert.ok(station.data.station.id);
  assert.equal(station.data.station.name, 'Station Cotonou Centre');
});

test('#6 recharge: profil de recharge d\'un véhicule', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token, { make: 'Tesla', model: 'Model 3' });

  const profile = await api('POST', '/api/innovations/eco-mobility/charging-profile', { token, body: {
    vehicle_id: v.id, battery_kwh: 60, connector_type: 'CCS2',
    avg_consumption_kwh_per_100km: 15, home_charge_price_cents: 120
  }});
  assert.equal(profile.status, 200);
  assert.equal(profile.data.charging_profile.battery_kwh, 60);

  const get = await api('GET', `/api/innovations/eco-mobility/charging-profile/${v.id}`, { token });
  assert.equal(get.status, 200);
  assert.equal(get.data.charging_profile.connector_type, 'CCS2');
});

test('#6 recharge: logger une session de recharge', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token, { make: 'BYD', model: 'Dolphin' });

  const session = await api('POST', '/api/innovations/eco-mobility/sessions', { token, body: {
    vehicle_id: v.id, duration_min: 45, energy_kwh: 32.5, cost_cents: 6500
  }});
  assert.equal(session.status, 200);
  assert.equal(session.data.session.energy_kwh, 32.5);
});

test('#6 recharge: bilan écologique', async () => {
  const { token } = await clientLogin();
  const v = await createVehicle(token, { make: 'Nissan', model: 'Leaf' });
  await api('POST', '/api/innovations/eco-mobility/sessions', { token, body: {
    vehicle_id: v.id, energy_kwh: 50, cost_cents: 10000
  }});

  const eco = await api('GET', `/api/innovations/eco-mobility/eco-summary/${v.id}`, { token });
  assert.equal(eco.status, 200);
  assert.ok(eco.data.stats.total_energy_kwh >= 50);
  assert.ok(eco.data.stats.co2_avoided_kg >= 0);
});

// ---------- #2 Rappels maintenance proactifs ----------

test('#2 rappels: générer des rappels à partir d\'alertes existantes', async () => {
  const { token } = await register({ role: 'CLIENT' });
  const v = await createVehicle(token);

  // seed maintenance_alert pour ce véhicule
  await pgQuery(
    `INSERT INTO maintenance_alerts (vehicle_id, label, mileage_due, due_date, severity, status)
     VALUES ($1, 'Changement huile', 100000, CURRENT_DATE + 5, 'MEDIUM', 'OPEN')`,
    [v.id]
  );

  const gen = await api('POST', '/api/innovations/maintenance-reminders/generate', { token, body: {
    vehicle_id: v.id, channel: 'WHATSAPP'
  }});
  assert.equal(gen.status, 200);
  assert.ok(gen.data.count >= 1);
  assert.equal(gen.data.reminders[0].channel, 'WHATSAPP');
});

test('#2 rappels: lister mes rappels', async () => {
  const { token } = await clientLogin();
  const list = await api('GET', '/api/innovations/maintenance-reminders', { token });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.data.reminders));
});

// ---------- Re-import pour les tests de badge vérifié ----------

test('#1 avis media: badge non vérifié pour intervention non CLOSE', async () => {
  const { token } = await clientLogin();
  const pro = await proToken();
  const { client, interventionId } = await buildJourney({ stage: 'repairing' });

  const rate = await api('POST', '/api/reviews', { token: client.token, body: {
    intervention_id: interventionId,
    professional_id: await myProfessionalId(pro),
    overall_stars: 3, comment: 'En cours'
  }});
  const ratingId = rate.data.rating.id;

  const verify = await api('POST', `/api/innovations/reviews/${ratingId}/verify`, { token: client.token, body: {} });
  assert.equal(verify.status, 200);
  assert.equal(verify.data.verified, false, 'intervention PAS CLOSED → non vérifié');
});
