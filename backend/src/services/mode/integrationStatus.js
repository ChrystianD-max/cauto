const config = require('../../config');
const { paymentManager } = require('../payment');
const { buildChannels } = require('../notifications/channels');
const RoutingService = require('../gps/RoutingService');

// Module 50 : état des intégrations externes.
// En MODE DÉMONSTRATION (DEMO_MODE=true), aucune intégration externe n'est
// "réellement connectée" : paiement, SMS, WhatsApp, GPS temps réel et IA externe
// sont simulés. Ce module alimente GET /api/config et les réponses de l'API
// (payments, notifications) pour que l'interface distingue clairement
// le mode démonstration des fonctionnalités réellement connectées.
function channelState(id) {
  const ch = buildChannels().find((c) => c.id === id);
  const base = { mode: 'live', live: true, configured: true };
  if (!ch) return base;
  const configured = ch.configured(); // déjà faussé à false par DEMO_MODE
  if (!configured) {
    return config.demoMode
      ? { mode: 'simulated', live: false, configured: false, note: 'Simulé (MODE DÉMONSTRATION) — livré via le canal C-AUTO interne' }
      : { mode: 'not_configured', live: false, configured: false, note: 'Clé(s) API manquante(s) en environnement' };
  }
  return { mode: 'live', live: true, configured: true, note: 'Connecté — envois réels' };
}

function status() {
  const demo = config.demoMode;

  const methods = paymentManager.listMethods();
  const anyPaymentConfigured = methods.some((m) => m.providers.some((p) => p.configured));
  const anyLive = methods.some((m) => m.providers.some((p) => !p.testMode));
  const payment = demo
    ? { mode: 'simulated', live: false, sandbox: true, configured: anyPaymentConfigured, note: 'Paiement en MODE DÉMONSTRATION — aucun débit réel, aucune passerelle externe' }
    : anyLive
      ? { mode: 'live', live: true, sandbox: false, configured: true, note: 'Passerelle(s) réelle(s) connectée(s)' }
      : { mode: 'sandbox', live: false, sandbox: true, configured: anyPaymentConfigured, note: process.env.PAYMENT_MODE === 'sandbox' ? 'Paiement en mode sandbox (PAYMENT_MODE=sandbox)' : 'Aucune clé de passerelle configurée — mode test' };

  const gpsConfigured = RoutingService.isConfigured();
  const gps = demo
    ? { mode: 'simulated', live: false, provider: 'simulated', note: 'Trajets simulés (haversine) — pas de GPS temps réel / routeur externe' }
    : gpsConfigured
      ? { mode: 'live', live: true, provider: process.env.ROUTING_PROVIDER || 'external', note: 'Routeur externe connecté (GPS temps réel)' }
      : { mode: 'fallback', live: false, provider: 'haversine', note: 'Routeur externe non configuré — calcul Haversine' };

  const ai = { mode: 'local', external: false, note: 'Diagnostic par moteur local (règles métier) — aucune IA externe connectée' };

  return {
    demoMode: demo,
    payment,
    sms: channelState('SMS'),
    whatsapp: channelState('WHATSAPP'),
    push: channelState('PUSH'),
    email: channelState('EMAIL'),
    gps,
    ai
  };
}

module.exports = { status };