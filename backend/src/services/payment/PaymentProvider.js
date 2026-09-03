const https = require('https');
const crypto = require('crypto');
const config = require('../../config');

// Base abstraite de fournisseur de paiement.
// Toute l'application consomme l'interface PaymentProvider :
//   begin({ amountCents, currency, idempotencyKey, userId, metadata })
//   verify({ providerRef, amountCents })
//   refund({ payment, note })          // défaut : no-op
// Les clés API ne viennent JAMAIS du code ni de la base : uniquement process.env.
class PaymentProvider {
  constructor({ code, method, label, country }) {
    this.code = code;
    this.method = method;
    this.label = label;
    this.country = country || 'BJ';
  }
  getCode() { return this.code; }
  getMethod() { return this.method; }
  getLabel() { return this.label; }

  isConfigured() { return false; }
  // MODE DÉMONSTRATION : JAMAIS d'appel à une passerelle réelle, même si des
  // clés API sont présentes. Le flag demoMode prime sur PAYMENT_MODE.
  isTestMode() {
    return config.demoMode || process.env.PAYMENT_MODE === 'sandbox' || !this.isConfigured();
  }

  // begin() doit renvoyer { providerRef, status, sandbox, paymentUrl?, extra? }
  async begin() { throw new Error('begin() non implémenté pour ' + this.code); }
  async verify() { throw new Error('verify() non implémenté pour ' + this.code); }
  async refund() { return { refunded: false }; }

  static key(name) { return process.env[name]; }

  static uuid() { return crypto.randomBytes(10).toString('hex'); }

  static ref(prefix) { return `${prefix}_${PaymentProvider.uuid()}`; }

  // Appel HTTP générique pour un fournisseur externe (mode réel uniquement).
  static httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const payload = JSON.stringify(body);
      const req = https.request({
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers }
      }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let j = {};
          try { j = JSON.parse(d); } catch (e) {}
          if (res.statusCode >= 400) return reject(new Error(`fournisseur ${u.hostname} HTTP ${res.statusCode}: ${d.slice(0, 300)}`));
          resolve(j);
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

module.exports = PaymentProvider;