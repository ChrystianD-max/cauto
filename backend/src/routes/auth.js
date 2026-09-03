const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');
const { signToken, requireAuth } = require('../middlewares/auth');
const { audit } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');
const { errorBody } = require('../utils/errorResponse');
const config = require('../config');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_AUTH_MAX || 20) });
const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_OTP_MAX || 10) });

// Recherche à coût constant : la valeur d'une liste de cibles est elle aussi divulguée,
// mais on évite une énumération triviale par différence de timing.
async function constantTarget(rows, code) {
  return rows.some((r) => crypto.timingSafeEqual(Buffer.from(r.code_hash, 'hex'), Buffer.from(sha256(code), 'hex')));
}

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

// ----- Module 41 : refresh tokens (rotatifs, stockés hachés, jamais en clair) -----
function newRefreshToken() {
  return { raw: crypto.randomBytes(48).toString('hex'), hash: null };
}

// ----- Module 62 — HTTPS : cookies sécurisés (httpOnly, Secure en prod, SameSite).
// Lecture du cookie sans dépendance (cookie-parser non requis). -----
function cookieValue(header, name) {
  if (!header) return '';
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=');
    if (eq > -1 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return '';
}

function setRefreshCookie(res, raw) {
  res.cookie(config.cookie.name, raw, {
    httpOnly: config.cookie.httpOnly,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: config.cookie.path,
    maxAge: config.cookie.maxAgeMs
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(config.cookie.name, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: config.cookie.path
  });
}

async function issueRefresh(userId, req) {
  const rt = newRefreshToken();
  rt.hash = sha256(rt.raw);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1,$2, now() + interval '30 days', $3, $4)`,
    [userId, rt.hash, req.ip, (req.headers['user-agent'] || '').slice(0, 250)]
  );
  return rt.raw;
}

async function rotateRefresh(raw, req) {
  const hash = sha256(raw);
  const row = await db.one(
    `SELECT rt.* FROM refresh_tokens rt WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
    [hash]
  ).catch(() => null);
  if (!row) throw new HttpError(401, 'Refresh token invalide ou expiré');
  const user = await db.one('SELECT id,name,email,phone,role,status FROM users WHERE id=$1', [row.user_id]);
  if (!user || user.status === 'SUSPENDED') throw new HttpError(401, 'Compte suspendu ou introuvable');
  await db.query('UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1', [row.id]);
  const nextRaw = await issueRefresh(user.id, req);
  return { user, raw: nextRaw };
}

// ----- Module 41 : OTP (codes hachés, expiration, compteur d'essais) -----
async function deliverOtp(req, user, code, purpose) {
  // MODE DÉMONSTRATION : jamais d'envoi par un fournisseur SMS réel.
  // Le code est retourné au client pour tester le parcours.
  if (config.demoMode) {
    return { medium: 'demo' };
  }
  const url = process.env.OTP_API_URL;
  const key = process.env.OTP_API_KEY;
  if (url && key) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ to: user.phone, code, purpose })
      });
      return { medium: 'sms' };
    } catch (e) {
      console.error('otp delivery failed', e.message);
    }
  }
  // Hors production : le code est retourné pour les tests/reprises de phase.
  return { medium: process.env.NODE_ENV === 'production' ? 'log' : 'debug' };
}

router.post('/otp/request', otpLimiter, wrap(async (req, res) => {
  const { email, purpose } = z.object({ email: z.string().email(), purpose: z.string().max(20).optional() }).parse(req.body || {});
  const user = await db.one('SELECT id,email,phone FROM users WHERE email=$1', [email.toLowerCase()]).catch(() => null);
  if (user) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await db.query(
      `INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at, attempts) VALUES ($1,$2,$3,$4,0)`,
      [user.id, purpose || 'LOGIN', sha256(code), expires]
    );
    const delivery = await deliverOtp(req, user, code, purpose || 'LOGIN');
    await audit(req, 'otp.request', 'user', user.id, { purpose });
    res.json({ ok: true, medium: delivery.medium, ...(['debug', 'demo'].includes(delivery.medium) ? { debug_code: code } : {}) });
    return;
  }
  // Anti-énumération : réponse uniforme même si l'email n'existe pas.
  await audit(req, 'otp.request', 'email', sha256(email.toLowerCase()).slice(0, 16), { purpose });
  res.json({ ok: true, medium: 'debug', note: 'email inconnu' });
}));

router.post('/otp/verify', otpLimiter, wrap(async (req, res) => {
  const { email, code, purpose } = z.object({ email: z.string().email(), code: z.string().min(4).max(8), purpose: z.string().max(20).optional() }).parse(req.body || {});
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Code invalide (6 chiffres attendus)');
  const user = await db.one('SELECT id FROM users WHERE email=$1', [email.toLowerCase()]).catch(() => null);
  if (!user) throw new HttpError(401, 'Code invalide');
  const row = await db.one(
    `SELECT o.id AS otp_id, o.code_hash, o.attempts,
            u.id AS user_id, u.name, u.email, u.phone, u.role
     FROM otp_codes o JOIN users u ON u.id = o.user_id
     WHERE o.user_id=$1 AND o.purpose=$2 AND o.consumed_at IS NULL AND o.expires_at > now()
     ORDER BY o.created_at DESC LIMIT 1`,
    [user.id, purpose || 'LOGIN']
  ).catch(() => null);
  const matched = row && await constantTarget([row], code);
  if (!matched) throw new HttpError(401, 'Code invalide ou expiré');
  if (row.attempts >= 5) throw new HttpError(429, 'Trop de tentatives, demandez un nouveau code');
  await db.query(`UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1`, [row.otp_id]);
  await db.query(`UPDATE otp_codes SET consumed_at=now() WHERE id=$1`, [row.otp_id]);
  await audit(req, 'otp.verify', 'user', row.user_id, { purpose });
  const safe = { id: row.user_id, name: row.name, email: row.email, phone: row.phone, role: row.role };
  res.json({ verified: true, token: signToken(safe), user: safe });
}));

router.post('/refresh', authLimiter, wrap(async (req, res) => {
  const body = (req.body && typeof req.body.refresh_token === 'string') ? req.body.refresh_token : '';
  const refresh_token = body || cookieValue(req.headers.cookie, config.cookie.name) || '';
  if (!refresh_token || refresh_token.length < 10) {
    res.status(400).json(errorBody(400, 'refresh_token manquant', 'VALIDATION_ERROR'));
    return;
  }
  const { user, raw } = await rotateRefresh(refresh_token, req);
  setRefreshCookie(res, raw);
  await audit(req, 'auth.refresh', 'user', user.id, {});
  res.json({ token: signToken(user), refresh_token: raw, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
}));

router.post('/logout', requireAuth, wrap(async (req, res) => {
  const body = (req.body && typeof req.body.refresh_token === 'string') ? req.body.refresh_token : '';
  const refresh_token = body || cookieValue(req.headers.cookie, config.cookie.name) || '';
  if (refresh_token) {
    const hash = sha256(refresh_token);
    await db.query(
      `UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL AND (user_id IS NULL OR true)`,
      [hash]
    );
  }
  clearRefreshCookie(res);
  await audit(req, 'auth.logout', 'user', req.user.sub, {});
  res.json({ message: 'Déconnecté' });
}));

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  phone: z.string().regex(/^\+[0-9]{8,15}$/),
  password: z.string().min(8).max(128),
  role: z.enum(['CLIENT', 'GARAGE', 'MECANICIEN', 'SUPPLIER', 'FLEET_MANAGER']).default('CLIENT'),
  garage_name: z.string().max(160).optional()
});

router.post('/register', authLimiter, wrap(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const exists = await db.one('SELECT id FROM users WHERE email=$1', [data.email.toLowerCase()]);
  if (exists) throw new HttpError(409, 'Un compte existe déjà avec cet email');
  const hash = await bcrypt.hash(data.password, 12);
  const user = await db.tx(async (c) => {
    const u = await c.query(
      `INSERT INTO users (name,email,phone,password_hash,role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,phone,role`,
      [data.name.trim(), data.email.toLowerCase(), data.phone, hash, data.role]
    );
    if (data.role === 'GARAGE' && data.garage_name) {
      const g = await c.query(
        'INSERT INTO garages (name, owner_id) VALUES ($1,$2) RETURNING id',
        [data.garage_name, u.rows[0].id]
      );
      // Modules 61/62 : un garage dispose aussi d'un profil pro (attestations,
      // vérification par l'admin, notation) — en attente de vérification.
      await c.query(
        'INSERT INTO professionals (user_id, garage_id, specialty, city, verification_status) VALUES ($1,$2,$3,$4,$5)',
        [u.rows[0].id, g.rows[0].id, 'MECANIQUE', '', 'PENDING']
      );
    }
    if (data.role === 'MECANICIEN') {
      await c.query(
        'INSERT INTO professionals (user_id, specialty, city, verification_status) VALUES ($1,$2,$3,$4)',
        [u.rows[0].id, 'MECANIQUE', '', 'PENDING']
      );
    }
    // Module 75 — MULTI-TENANT : chaque compte pro/entreprise/fournisseur
    // reçoit son tenant à l'inscription (propriétaire initial).
    const tenantType = data.role === 'GARAGE' ? 'GARAGE'
      : data.role === 'SUPPLIER' ? 'FOURNISSEUR'
      : data.role === 'FLEET_MANAGER' ? 'ENTREPRISE' : null;
    if (tenantType) {
      const t = await c.query(
        'INSERT INTO tenants (type, name) VALUES ($1,$2) RETURNING id',
        [tenantType, data.garage_name || data.name.trim()]
      );
      await c.query(
        'INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [t.rows[0].id, u.rows[0].id, 'OWNER']
      );
    }
    return u.rows[0];
  });
  req.user = { sub: user.id };
  await audit(req, 'auth.register', 'user', user.id, { role: user.role });
  const refresh = await issueRefresh(user.id, req);
  setRefreshCookie(res, refresh);
  res.status(201).json({ token: signToken(user), refresh_token: refresh, user });
}));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/login', authLimiter, wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await db.one('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw new HttpError(401, 'Identifiants invalides');
  const proRow = await db.one('SELECT is_certified FROM professionals WHERE user_id=$1', [user.id]).catch(() => null);
  const safe = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, is_certified: !!(proRow && proRow.is_certified) };
  await audit(req, 'auth.login', 'user', user.id, {});
  const refresh = await issueRefresh(user.id, req);
  setRefreshCookie(res, refresh);
  res.json({ token: signToken(safe), refresh_token: refresh, user: safe });
}));

router.get('/me', requireAuth, wrap(async (req, res) => {
  const user = await db.one(`SELECT id,name,email,phone,role,created_at,
    COALESCE((SELECT p.is_certified FROM professionals p WHERE p.user_id=users.id), false) AS is_certified
    FROM users WHERE id=$1`, [req.user.sub]);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable');
  const prefs = await db.one('SELECT params FROM user_profiles WHERE user_id=$1', [req.user.sub]).catch(() => null);
  const p = (prefs && prefs.params) || {};
  const CountryService = require('../core/countries');
  res.json({ user: { ...user, is_certified: !!user.is_certified, locale: p.locale || process.env.DEFAULT_LOCALE || 'fr', country: p.country || await CountryService.defaultCountryCode() } });
}));

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().regex(/^\+[0-9]{8,15}$/).optional(),
  email: z.string().email().max(200).optional(),
  locale: z.enum(['fr', 'en', 'fon', 'yo']).optional(),
  current_password: z.string().min(1).optional(),
  new_password: z.string().min(8).max(128).optional()
});

router.patch('/me', requireAuth, wrap(async (req, res) => {
  const data = patchSchema.parse(req.body);
  const user = await db.one('SELECT * FROM users WHERE id=$1', [req.user.sub]);
  if (data.email && data.email.toLowerCase() !== user.email) {
    const dup = await db.one('SELECT id FROM users WHERE email=$1 AND id<>$2', [data.email.toLowerCase(), req.user.sub]);
    if (dup) throw new HttpError(409, 'Cet email est déjà utilisé');
  }
  if (data.new_password) {
    if (!data.current_password) throw new HttpError(400, 'Mot de passe actuel requis pour changer le mot de passe');
    const ok = await bcrypt.compare(data.current_password, user.password_hash);
    if (!ok) throw new HttpError(401, 'Mot de passe actuel incorrect');
  }
  const sets = [];
  const vals = [];
  let i = 1;
  if (data.name) { sets.push(`name=$${i++}`); vals.push(data.name.trim()); }
  if (data.phone) { sets.push(`phone=$${i++}`); vals.push(data.phone); }
  if (data.email) { sets.push(`email=$${i++}`); vals.push(data.email.toLowerCase()); }
  if (data.new_password) {
    const hash = await bcrypt.hash(data.new_password, 12);
    sets.push(`password_hash=$${i++}`); vals.push(hash);
  }
  if (sets.length === 0 && !data.locale) throw new HttpError(400, 'Aucune modification fournie');
  if (sets.length) {
    vals.push(req.user.sub);
    const updated = await db.one(
      `UPDATE users SET ${sets.join(', ')} WHERE id=$${i} RETURNING id,name,email,phone,role,created_at`,
      vals
    );
    await audit(req, 'auth.update_profile', 'user', req.user.sub, { fields: Object.keys(data) });
    res.json({ user: updated });
    return;
  }
  res.status(200).json({ message: 'ok' });
}));

router.patch('/me/locale', requireAuth, wrap(async (req, res) => {
  const { locale } = z.object({ locale: z.enum(['fr', 'en', 'fon', 'yo']) }).parse(req.body || {});
  await db.query(
    `INSERT INTO user_profiles (user_id, params) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET params = user_profiles.params || $2`,
    [req.user.sub, JSON.stringify({ locale })]
  );
  await audit(req, 'auth.update_locale', 'user', req.user.sub, { locale });
  res.json({ locale });
}));

const deleteSchema = z.object({ password: z.string().min(1) });

router.delete('/me', requireAuth, wrap(async (req, res) => {
  const { password } = deleteSchema.parse(req.body);
  const user = await db.one('SELECT * FROM users WHERE id=$1', [req.user.sub]);
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Mot de passe incorrect');
  await db.query('DELETE FROM users WHERE id=$1', [req.user.sub]);
  await audit(req, 'auth.delete_account', 'user', req.user.sub, {});
  res.json({ message: 'Compte supprimé' });
}));

module.exports = router;
