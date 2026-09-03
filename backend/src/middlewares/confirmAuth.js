const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { HttpError, wrap } = require('../utils/errors');

// MODULE 76 — AUTHENTIFICATION RENFORCÉE pour les actions sensibles.
// Deux modes de confirmation, appliqués après le gate de rôle (SUPER_ADMIN) :
//   'password' — { confirm_password: '...' } dans le body → vérifié vs bcrypt.
//   'otp'      — { confirm_otp: '123456' } → vérifié via otp_codes (purpose
//                'SUPER_CONFIRM'), côté serveur (code haché, expiration, compteur).
// En mode démo/débogage, un OTP peut être consommé via /api/auth/otp/request.

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

function digestMatch(row, raw) {
  return crypto.timingSafeEqual(
    Buffer.from(row.code_hash, 'hex'),
    Buffer.from(sha256(raw), 'hex')
  );
}

// Retourne un middleware Express. closure() permet de savoir si le body exige
// une confirmation avant de révéler le terrain (évite les fuites de logique).
function requireSuperConfirm(mode = 'password') {
  return wrap(async (req, res, next) => {
    // Seul un SUPER_ADMIN passe (le gate requireRole('ADMIN') est en amont,
    // mais on re-vérifie isSuperAdmin pour ne jamais laisser un simple ADMIN).
    if (!req.user || !req.user.isSuperAdmin) {
      throw new HttpError(403, 'Réservé au super administrateur');
    }

    if (mode === 'password') {
      const pwd = req.body && req.body.confirm_password;
      if (!pwd || typeof pwd !== 'string') {
        throw new HttpError(401, 'Confirmation requise (mot de passe)');
      }
      const user = await db.one('SELECT password_hash FROM users WHERE id=$1', [req.user.sub]);
      if (!user) throw new HttpError(401, 'Compte introuvable');
      const ok = await bcrypt.compare(pwd, user.password_hash);
      if (!ok) throw new HttpError(401, 'Mot de passe de confirmation incorrect');
      return next();
    }

    if (mode === 'otp') {
      const code = req.body && req.body.confirm_otp;
      if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        throw new HttpError(401, 'Code de confirmation invalide (6 chiffres)');
      }
      const row = await db.one(
        `SELECT o.id AS otp_id, o.code_hash,
                u.id AS user_id, u.password_hash
         FROM otp_codes o JOIN users u ON u.id = o.user_id
         WHERE o.user_id=$1 AND o.purpose='SUPER_CONFIRM'
           AND o.consumed_at IS NULL AND o.expires_at > now()
         ORDER BY o.created_at DESC LIMIT 1`,
        [req.user.sub]
      ).catch(() => null);
      if (!row) throw new HttpError(401, 'Code de confirmation expiré ou inexistant');
      if (!digestMatch(row, code)) {
        await db.query('UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1', [row.otp_id]);
        throw new HttpError(401, 'Code de confirmation incorrect');
      }
      if (row.attempts >= 5) {
        throw new HttpError(429, 'Trop de tentatives, demandez un nouveau code');
      }
      await db.query('UPDATE otp_codes SET consumed_at=now() WHERE id=$1', [row.otp_id]);
      return next();
    }

    throw new HttpError(500, 'Mode de confirmation inconnu');
  });
}

module.exports = { requireSuperConfirm };
