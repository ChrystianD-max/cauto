const db = require('../db');
const { HttpError } = require('../utils/errors');

// Module 44/45 — C-AUTO n'est PAS limité au Bénin.
// Le pays par défaut (env DEFAULT_COUNTRY ou réglage admin 'country') est le
// point d'entrée ; aucune règle métier ne code un pays ou une devise en dur.
const CountryService = {
  async defaultCountryCode() {
    const s = await db.one("SELECT value FROM app_settings WHERE key='country'").catch(() => null);
    return (s && s.value) || process.env.DEFAULT_COUNTRY || 'BJ';
  },

  async get(code) {
    const row = await db.one(
      `SELECT c.code, c.name, c.name_fr, c.region, c.phone_code, c.default_locale, c.is_active,
              cur.code AS currency_code, cur.name AS currency_name, cur.symbol AS currency_symbol, cur.decimals AS currency_decimals
       FROM countries c JOIN currencies cur ON cur.code = c.currency_code
       WHERE c.code = $1`, [code]
    ).catch(() => null);
    if (!row) throw new HttpError(404, 'Pays inconnu : ' + code);
    return row;
  },

  async list({ activeOnly = false } = {}) {
    const rows = await db.many(
      `SELECT c.code, c.name, c.name_fr, c.region, c.phone_code, c.default_locale, c.is_active, c.sort_order,
              cur.code AS currency_code, cur.symbol AS currency_symbol
       FROM countries c JOIN currencies cur ON cur.code = c.currency_code
       ${activeOnly ? 'WHERE c.is_active = true' : ''}
       ORDER BY c.sort_order, c.code`
    );
    return rows || [];
  },

  async regions(code) {
    const rows = await db.many('SELECT code, name, is_active FROM regions WHERE country_code=$1 ORDER BY name', [code]).catch(() => []);
    return rows || [];
  },

  async cities(code) {
    const rows = await db.many('SELECT id, name, region_code, lat, lng, is_active FROM cities WHERE country_code=$1 ORDER BY name', [code]).catch(() => []);
    return rows || [];
  },

  async currencies() {
    return db.many('SELECT code, name, symbol, decimals, iso_number, is_active FROM currencies ORDER BY code').catch(() => []);
  },

  async currencyFor(code) {
    const c = await this.get(code);
    return {
      code: c.currency_code,
      name: c.currency_name,
      symbol: c.currency_symbol,
      decimals: c.currency_decimals
    };
  },

  async defaultCurrency() {
    return this.currencyFor(await this.defaultCountryCode());
  },

  async paymentMethods(code) {
    const cc = code || await this.defaultCountryCode();
    const rows = await db.many(
      `SELECT code, name, name_fr, params FROM payment_methods
       WHERE $1 = ANY(countries) AND is_active = true ORDER BY code`, [cc]
    ).catch(() => []);
    return rows || [];
  },

  // Affichage monétaire : jamais de symbole hardcodé (module 45).
  money(cents, currency) {
    const sym = (currency && currency.symbol) || 'F CFA';
    const decimals = (currency && currency.decimals) || 0;
    const n = (cents || 0) / 100;
    return n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' ' + sym;
  }
};

module.exports = CountryService;