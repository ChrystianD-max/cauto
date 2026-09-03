const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { wrap } = require('../utils/errors');
const { validate, z } = require('../utils/validate');
const NotificationService = require('../services/notifications/NotificationService');
const config = require('../config');
const { status: integrationStatus } = require('../services/mode/integrationStatus');

const router = express.Router();
router.use(requireAuth);

const ALLOWED_CHANNELS = ['CHAT', 'PUSH', 'SMS', 'EMAIL', 'WHATSAPP'];

const channelList = z.array(
  z.string().trim().transform((s) => s.toUpperCase())
).refine((arr) => arr.every((c) => ALLOWED_CHANNELS.includes(c)), { message: 'Canal inconnu', path: ['channels'] });

const prefsSchema = z.object({
  channels: channelList.optional(),
  fallback: channelList.optional()
}).refine((v) => v.channels || v.fallback, { message: 'Aucune préférence fournie' });

// GET /api/notifications — notifications de l'utilisateur connecté
router.get('/', wrap(async (req, res) => {
  const rows = await db.many(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
    [req.user.sub]
  );
  res.json({ notifications: rows });
}));

// GET /api/notifications/preferences — canaux & ordre de fallback
router.get('/preferences', wrap(async (req, res) => {
  const p = await db.one('SELECT params FROM user_profiles WHERE user_id=$1', [req.user.sub]).catch(() => null);
  const params = (p && p.params) || {};
  const fallbackDefault = NotificationService.defaultOrder();
  const st = integrationStatus();
  res.json({
    channels: Array.isArray(params.notif) ? params.notif : ['CHAT'],
    fallback: Array.isArray(params.notif_fallback) ? params.notif_fallback : fallbackDefault,
    available: ALLOWED_CHANNELS,
    demoMode: config.demoMode,
    channels_status: { PUSH: st.push, SMS: st.sms, EMAIL: st.email, WHATSAPP: st.whatsapp }
  });
}));

// PUT/PATCH /api/notifications/preferences
router.put('/preferences', validate(prefsSchema), wrap(async (req, res) => {
  await db.query(
    `INSERT INTO user_profiles (user_id, params) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET params = user_profiles.params || $2`,
    [req.user.sub, JSON.stringify({ notif: req.body.channels || [], notif_fallback: req.body.fallback || [] })]
  );
  res.json({ message: 'Préférences mises à jour' });
}));

// PATCH /api/notifications/:id/read — marquer comme lue (le modèle supprime la notif)
router.patch('/:id/read', wrap(async (req, res) => {
  await db.query('DELETE FROM notifications WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]);
  res.json({ message: 'Notification supprimée' });
}));

// DELETE /api/notifications/read-all — tout marquer comme lu
router.delete('/read-all', wrap(async (req, res) => {
  await db.query('DELETE FROM notifications WHERE user_id=$1', [req.user.sub]);
  res.json({ message: 'Toutes les notifications supprimées' });
}));

module.exports = router;