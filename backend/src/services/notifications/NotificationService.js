const db = require('../../db');
const crypto = require('crypto');
const config = require('../../config');
const { buildChannels, CHANNELS } = require('./channels');
const WebPushService = require('./WebPushService');

// NotificationService : multicanal avec FALLBACK.
// Ordre par défaut (env) : push,sms,email,whatsapp — le canal CHAT C-AUTO
// (in-app) est toujours le socle ; les canaux configurés sont tentés dans
// l'ordre, le premier qui réussit remplace les suivants.
class NotificationService {
  constructor() {
    this.channels = buildChannels();
  }

  getChannel(id) {
    return this.channels.find((c) => c.id === id);
  }

  defaultOrder() {
    const fromEnv = (process.env.NOTIF_FALLBACK_ORDER || '')
      .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (fromEnv.length) return fromEnv;
    // MODE DÉMONSTRATION : seul le canal interne CHAT C-AUTO est utilisé,
    // sauf quand le Web Push (VAPID) est réellement configuré (il ne dépend pas
    // d'une passerelle externe) — dans ce cas les presses partent vraiment.
    if (config.demoMode) return WebPushService.isConfigured() ? [CHANNELS.CHAT, CHANNELS.PUSH] : [CHANNELS.CHAT];
    return ['PUSH', 'SMS', 'EMAIL', 'WHATSAPP'];
  }

  async _prefs(userId) {
    const p = await db.one('SELECT params FROM user_profiles WHERE user_id=$1', [userId]).catch(() => null);
    const prefs = (p && p.params && Array.isArray(p.params.notif)) ? p.params.notif : [];
    const fallback = (p && p.params && Array.isArray(p.params.notif_fallback)) ? p.params.notif_fallback : [];
    return { channels: prefs.length ? prefs : this.defaultOrder(), fallback: fallback.length ? fallback : this.defaultOrder() };
  }

  _chain(channels, fallback = []) {
    const ids = [];
    const push = (id) => { if (!ids.includes(id)) ids.push(id); };
    push(CHANNELS.CHAT);
    for (const c of channels) push(c);
    for (const f of fallback) push(f);
    return ids;
  }

  async _record({ notificationId, userId, channel, status, attempt, error }) {
    await db.query(
      `INSERT INTO notification_deliveries (notification_id, user_id, channel, status, attempt, error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [notificationId || null, userId, channel, status, attempt, error || null]
    ).catch(() => null);
  }

  async _userContact(userId, channel) {
    const u = await db.one('SELECT phone, email, name FROM users WHERE id=$1', [userId]).catch(() => null);
    if (!u) return null;
    if (channel === CHANNELS.EMAIL) return u.email;
    if (channel === CHANNELS.SMS || channel === CHANNELS.WHATSAPP) return u.phone;
    return u;
  }

  // Envoi multicanal avec fallback. Renvoie le détail des canaux tentés.
  async notify(userIds, { message, title = 'C-AUTO', dedupeKey, channels }, opts = {}) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    const summary = { sent: 0, attempted: [], delivered: [] };
    for (const userId of ids) {
      const prefs = await this._prefs(userId);
      const chain = channels && channels.length ? [CHANNELS.CHAT, ...channels.filter((c) => c !== CHANNELS.CHAT)] : this._chain(prefs.channels, prefs.fallback);

      const key = dedupeKey
        ? `${dedupeKey}_${userId}`
        : `notif:${crypto.createHash('sha1').update(message).digest('hex')}`;
      const notif = await db.one(
        `INSERT INTO notifications (user_id, message, dedupe_key) VALUES ($1, $2, $3)
         ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`, [userId, message, key]
      ).catch(() => null);

      let attempt = 0;
      for (const channelId of chain) {
        const channel = this.getChannel(channelId);
        if (!channel) continue;
        if (channelId === CHANNELS.CHAT) {
          if (notif) {
            await this._record({ notificationId: notif.id, userId, channel: CHANNELS.CHAT, status: 'DELIVERED', attempt: ++attempt });
            summary.delivered.push({ userId, channel: CHANNELS.CHAT });
          }
          continue;
        }
        if (!channel.configured()) {
          await this._record({ notificationId: notif?.id || null, userId, channel: channelId, status: 'SKIPPED', attempt: ++attempt, error: 'non configuré' });
          summary.attempted.push({ userId, channel: channelId, status: 'SKIPPED' });
          continue; // fallback automatique => canal suivant
        }
        const contact = await this._userContact(userId, channelId);
        try {
          const res = await channel.send({ message, title, userId, meta: contact });
          await this._record({ notificationId: notif?.id || null, userId, channel: channelId, status: 'DELIVERED', attempt: ++attempt });
          summary.delivered.push({ userId, channel: channelId });
          summary.attempted.push({ userId, channel: channelId, status: 'DELIVERED' });
          break; // succès : on arrête la chaîne de fallback pour cet utilisateur
        } catch (e) {
          await this._record({ notificationId: notif?.id || null, userId, channel: channelId, status: 'FAILED', attempt: ++attempt, error: e.message });
          summary.attempted.push({ userId, channel: channelId, status: 'FAILED', error: e.message });
        }
      }
      summary.sent += notif ? 1 : 0;
    }
    return summary;
  }

  // Diffusion à tous (ou à un rôle) — socle CHAT + canaux selon préférences,
  // avec clé de déduplication par destinataire (broadcast_<base>_<uid>).
  async broadcast({ message, title = 'C-AUTO', role, key }) {
    const base = key || crypto.createHash('sha1').update(message).digest('hex');
    const users = role
      ? await db.many('SELECT id FROM users WHERE role=$1::text', [role])
      : await db.many('SELECT id FROM users');
    await this.notify(
      users.map((u) => u.id),
      { message, title, dedupeKey: 'broadcast_' + base },
      {}
    );
    return { sent: users.length, recipients: users.length };
  }
}

module.exports = new NotificationService();