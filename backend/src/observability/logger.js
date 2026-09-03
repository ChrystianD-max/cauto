'use strict';

/* =============================================================================
   C-AUTO — Observabilité (module 65) : Logger JSON structuré
   -----------------------------------------------------------------------------
   Zéro dépendance : lignes JSON SLF4J-like écrites sur stdout (Docker →
   json-file → n'importe quel collecteur : Loki/Promtail, Datadog, filebeat,
   Graylog…). Niveaux : debug < info < warn < error < fatal (LOG_LEVEL).
   `child(bindings)` propage un contexte (reqId, userId…) à toutes les sorties.
   =========================================================================== */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };

function resolveLevel() {
  const raw = String(process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[raw] != null ? raw : 'info';
}

function nowIso() {
  return new Date().toISOString();
}

function stringify(fields) {
  try {
    return JSON.stringify(fields);
  } catch {
    return JSON.stringify({ msg: 'log_object_serialisation_failed' });
  }
}

function makeCaller(level) {
  return (fieldsOrMsg, msg) => {
    if (LEVELS[level] < LEVELS[resolveLevel()]) return;
    const base = { time: nowIso(), level, pid: process.pid, name: 'cauto-backend' };
    const fields = {};
    for (const k of Object.keys(base)) fields[k] = base[k];
    for (const k of Object.keys(this.bindings || {})) fields[k] = this.bindings[k];
    if (typeof fieldsOrMsg === 'object' && fieldsOrMsg !== null) {
      for (const k of Object.keys(fieldsOrMsg)) fields[k] = fieldsOrMsg[k];
      fields.msg = msg;
    } else {
      fields.msg = fieldsOrMsg;
    }
    process.stdout.write(`${stringify(fields)}\n`);
  };
}

const logger = {
  level: resolveLevel(),
  bindings: {},
  child(bindings) {
    const c = Object.create(Object.getPrototypeOf({}));
    Object.setPrototypeOf(c, this);
    c.bindings = { ...this.bindings, ...bindings };
    c.level = resolveLevel();
    return c;
  },
};

for (const lv of Object.keys(LEVELS)) {
  if (lv === 'fatal') logger.fatal = makeCaller.call(logger, lv);
  else logger[lv] = makeCaller.call(logger, lv);
}

module.exports = logger;
module.exports.LEVELS = LEVELS;