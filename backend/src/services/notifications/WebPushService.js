const webpush = require('web-push');
const db = require('../../db');
const config = require('../../config');

// WebPushService — Notifications push navigateur (protocole Web Push / VAPID).
// Les abonnements sont stockés dans push_subscriptions (par user), les
// notifications à envoyer dans push_outbox (alimenté par un trigger SQL sur
// notifications). drainOutbox() est appelé périodiquement par le serveur.
class WebPushService {
  constructor() {
    this._initialized = false;
  }

  ensureInit() {
    if (this._initialized || !this.isConfigured()) return;
    webpush.setVapidDetails(
      config.push.vapidSubject || 'mailto:admin@cauto.local',
      config.push.vapidPublicKey,
      config.push.vapidPrivateKey
    );
    this._initialized = true;
  }

  isConfigured() {
    return !!(config.push.vapidPrivateKey && config.push.vapidPublicKey);
  }

  publicKey() {
    return config.push.vapidPublicKey || '';
  }

  // Envoie à TOUTES les abonnements d'un utilisateur. Supprime les endpoints
  // morts (404/410). Renvoie { sent, removed }.
  async sendToUser(userId, { title = 'C-AUTO', body, url = '/app' }) {
    if (!this.isConfigured()) return { sent: 0, removed: 0 };
    this.ensureInit();
    const subs = await db.many(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=$1',
      [userId]
    ).catch(() => []);
    let sent = 0;
    let removed = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: title || 'C-AUTO', body: body || '', url: url || '/app' })
        );
        sent++;
      } catch (e) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) {
          await db.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [s.endpoint]).catch(() => {});
          removed++;
        }
      }
    }
    return { sent, removed };
  }

  // Vide la file d'attente push (outbox). Ne s'exécute que si VAPID est configuré.
  async drainOutbox(batch = 50) {
    if (!this.isConfigured()) return { processed: 0 };
    this.ensureInit();
    const rows = await db.many(
      `SELECT id, user_id, title, body, url FROM push_outbox
         WHERE status = 'PENDING' AND attempts < 3
         ORDER BY id ASC LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [batch]
    ).catch(() => []);
    let processed = 0;
    for (const row of rows) {
      const r = await this.sendToUser(row.user_id, {
        title: row.title || 'C-AUTO',
        body: row.body,
        url: row.url || '/app'
      });
      processed += r.sent;
      await db.query(
        `UPDATE push_outbox
            SET status = CASE WHEN $1 THEN 'SENT' ELSE 'NO_SUB' END,
                attempts = attempts + 1,
                sent_at = CASE WHEN $1 THEN now() ELSE NULL END,
                last_error = CASE WHEN $1 THEN NULL ELSE $2 END
          WHERE id = $3`,
        [r.sent > 0, 'aucun abonnement push actif', row.id]
      ).catch(() => {});
    }
    return { processed };
  }
}

module.exports = new WebPushService();