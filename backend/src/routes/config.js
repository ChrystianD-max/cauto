const express = require('express');
const config = require('../config');
const pkg = require('../../package.json');
const { status } = require('../services/mode/integrationStatus');
const WebPushService = require('../services/notifications/WebPushService');

// Module 50 : GET /api/config — état public du mode d'exécution.
// Aucune donnée sensible (clés, URLs internes) : uniquement des drapeaux et libellés
// permettant à l'interface d'afficher le MODE DÉMONSTRATION vs fonctionnalités réelles.
const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    app: 'C-AUTO',
    version: pkg.version,
    environment: config.env,
    demoMode: config.demoMode,
    mode: config.demoMode ? 'DEMO' : 'LIVE',
    disclaimer: config.demoMode
      ? 'Mode démonstration : le paiement réel, le SMS, le WhatsApp, le GPS temps réel et l\'IA externe sont simulés. Aucune opération réelle n\'est émise vers l\'extérieur.'
      : null,
    integrations: Object.assign(status(), { pushVapidPublicKey: WebPushService.publicKey() })
  });
});

module.exports = router;