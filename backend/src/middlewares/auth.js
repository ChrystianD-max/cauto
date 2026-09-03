const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { HttpError, wrap } = require('../utils/errors');

// Rôles canoniques (côté backend uniquement — on ne fait jamais confiance au frontend).
const ROLES = ['CLIENT', 'GARAGE', 'MECANICIEN', 'EXPERT', 'SUPPLIER', 'LIVREUR', 'FLEET_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Authentification requise');
  try {
    req.user = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'Session expirée ou invalide');
  }
  // Hiérarchie RBAC : SUPER_ADMIN agit avec tous les droits ADMIN côté serveur.
  if (req.user.role === 'SUPER_ADMIN') {
    req.user.isSuperAdmin = true;
    req.user.role = 'ADMIN';
  }
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(new HttpError(401, 'Authentification requise'));
  const r = req.user.role;
  const allowed = req.user.isSuperAdmin
    ? true
    : roles.includes(r) || (roles.includes('ADMIN') && r === 'ADMIN');
  if (!allowed) return next(new HttpError(403, 'Accès refusé pour ce rôle'));
  next();
};

// Vérification fine côté backend via user_roles + role_permissions.
const hasPermission = async (userId, code) => {
  const rows = await db.many(
    `SELECT p.code FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.some((r) => r.code === code);
};

const requirePermission = (code) => wrap(async (req, res, next) => {
  if (!req.user) throw new HttpError(401, 'Authentification requise');
  if (req.user.isSuperAdmin) return next();
  if (!(await hasPermission(req.user.sub, code))) {
    throw new HttpError(403, 'Permission requise : ' + code);
  }
  next();
});

module.exports = { signToken, requireAuth: wrap(requireAuth), requireRole, requirePermission, hasPermission, ROLES };