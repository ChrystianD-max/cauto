const DICT = require('./i18n-dict');
const { HttpError } = require('../utils/errors');

// Module 46 — i18n backend : résolution clé par locale avec repli sur le français.
const SUPPORTED = Object.keys(DICT); // ['fr','en','fon','yo']
const DEFAULT_LOCALE = 'fr';

function normalize(locale) {
  return String(locale || DEFAULT_LOCALE).toLowerCase().split('-')[0];
}

function resolveDict(locale) {
  const l = normalize(locale);
  if (!SUPPORTED.includes(l)) throw new HttpError(400, 'Locale inconnue : ' + locale);
  return DICT[l];
}

function messagesFor(locale) {
  const l = normalize(locale);
  if (!SUPPORTED.includes(l)) throw new HttpError(400, 'Locale inconnue : ' + locale);
  // Repli : toute clé manquante est rendue en français (langue principale du MVP).
  return { ...DICT[DEFAULT_LOCALE], ...DICT[l], '': l };
}

function t(locale, key, params) {
  const dict = messagesFor(locale) || {};
  let v = dict[key];
  if (v === undefined) v = key;
  if (params) {
    for (const [k, val] of Object.entries(params)) v = v.replace(new RegExp('\\{' + k + '\\}', 'g'), val);
  }
  return v;
}

module.exports = { SUPPORTED, DEFAULT_LOCALE, normalize, messagesFor, t };