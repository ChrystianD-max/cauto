const db = require('../db');

// Module 43 — Journal d'audit enrichi : WHO / WHAT / WHEN / IP / avant / après.
// audit_logs.before et audit_logs.after (jsonb) viennent de la migration v13.
// La table est protégée par un trigger immuable (pas de mise à jour/suppression).

function reveal(row) {
  if (row === undefined || row === null) return null;
  const o = { ...row };
  // Ne JAMAIS écrire un secret (même haché dans "after" est inutile / risqué).
  for (const k of Object.keys(o)) {
    if (/password|secret|token|refresh/i.test(k)) o[k] = '[HIDDEN]';
  }
  delete o.password_hash;
  return o;
}

async function audit(req, action, entity, entityId, meta = {}) {
  return auditChange(req, action, entity, entityId, null, null, meta);
}

async function auditChange(req, action, entity, entityId, before, after, meta = {}) {
  try {
    await db.query(
      `INSERT INTO audit_logs (actor_id, action, entity, entity_id, meta, ip, "before", "after")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.user ? req.user.sub : null,
        action,
        entity,
        entityId ? String(entityId) : null,
        JSON.stringify(meta),
        req.ip,
        before === undefined || before === null ? null : JSON.stringify(reveal(before)),
        after === undefined || after === null ? null : JSON.stringify(reveal(after))
      ]
    );
  } catch (e) {
    console.error('audit failed', e.message);
  }
}

module.exports = { audit, auditChange, reveal };