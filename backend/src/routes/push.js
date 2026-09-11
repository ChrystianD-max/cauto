const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { wrap } = require('../utils/errors');
const { validate, z } = require('../utils/validate');
const WebPushService = require('../services/notifications/WebPushService');

// Module 67 — Web Push : abonnement/désabonnement des appareils, envoi d'un
// test. GET /api/push/vapid (public) expose uniquement la clé publique.
const router = express.Router();

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  }),
  userAgent: z.string().max(400).optional()
});

// Clé publique VAPID (publique par nature) — pas d'authentification requise.
router.get('/vapid', (_req, res) => {
  res.json({ publicKey: WebPushService.publicKey(), configured: WebPushService.isConfigured() });
});

router.use(requireAuth);

// POST /api/push/subscribe — enregistre (ou met à jour) un abonnement
router.post('/subscribe', validate(subSchema), wrap(async (req, res) => {
  const s = req.body;
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint)
     DO UPDATE SET user_id = $1, p256dh = $3, auth = $4, user_agent = $5, updated_at = now()`,
    [req.user.sub, s.endpoint, s.keys.p256dh, s.keys.auth, s.userAgent || null]
  );
  res.json({ message: 'Abonnement push enregistré' });
}));

// POST /api/push/unsubscribe — retire l'abonnement de l'utilisateur courant
router.post('/unsubscribe', validate(z.object({ endpoint: z.string().url() })), wrap(async (req, res) => {
  await db.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [req.user.sub, req.body.endpoint]);
  res.json({ message: 'Abonnement push supprimé' });
}));

// POST /api/push/test — envoie un message de test à l'appareil courant
router.post('/test', wrap(async (req, res) => {
  const r = await WebPushService.sendToUser(req.user.sub, {
    title: 'C-AUTO',
    body: 'Test de notification push : ça marche !',
    url: '/app'
  });
  res.json({ sent: r.sent, removed: r.removed });
}));

module.exports = router;