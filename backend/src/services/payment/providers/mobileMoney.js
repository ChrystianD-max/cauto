const PaymentProvider = require('../PaymentProvider');

// Mobile Money (Bénin & région UEMOA) : MTN MoMo, Moov Money, Wave, Orange Money...
// Chaque opérateur est un adaptateur ; la liste est configurables en environnements.
const KNOWN_CODES = {
  MTN_MOMO: { label: 'MTN Mobile Money', keyPrefix: 'MTN_MOMO' },
  MOOV_MONEY: { label: 'Moov Money', keyPrefix: 'MOOV_MONEY' },
  WAVE: { label: 'Wave', keyPrefix: 'WAVE' },
  ORANGE_MONEY: { label: 'Orange Money', keyPrefix: 'ORANGE_MONEY' }
};

class MobileMoneyProvider extends PaymentProvider {
  constructor(code = 'MTN_MOMO') {
    const cfg = KNOWN_CODES[code] || { label: code, keyPrefix: code };
    super({ code, method: 'MOBILE_MONEY', label: cfg.label, country: 'BJ' });
    this.keyPrefix = cfg.keyPrefix;
  }

  isConfigured() {
    return !!(PaymentProvider.key(`${this.keyPrefix}_API_KEY`) && PaymentProvider.key(`${this.keyPrefix}_API_URL`));
  }

  async begin({ amountCents, currency = 'XOF', idempotencyKey, userId, metadata = {} }) {
    if (this.isTestMode()) {
      return {
        providerRef: PaymentProvider.ref('momo'),
        status: 'PENDING',
        sandbox: true,
        paymentUrl: `/pay/sandbox/${this.code.toLowerCase()}`,
        simCode: `${Math.floor(100000 + Math.random() * 899999)}`,
        extra: { operator: this.code }
      };
    }
    const res = await PaymentProvider.httpPost(
      PaymentProvider.key(`${this.keyPrefix}_API_URL`),
      {
        amount: amountCents / 100,
        currency,
        operator: this.code,
        external_id: idempotencyKey,
        customer_phone: metadata.phone,
        reference: metadata.reference
      },
      { Authorization: 'Bearer ' + PaymentProvider.key(`${this.keyPrefix}_API_KEY`) }
    );
    return {
      providerRef: res.reference || PaymentProvider.ref('momo'),
      status: 'PENDING',
      sandbox: false,
      paymentUrl: res.payment_url || null,
      extra: { operator: this.code, raw: res }
    };
  }

  async verify({ providerRef, amountCents }) {
    if (this.isTestMode()) {
      return { providerRef, status: 'SUCCEEDED', sandbox: true };
    }
    const res = await PaymentProvider.httpPost(
      PaymentProvider.key(`${this.keyPrefix}_API_URL`) + '/verify',
      { reference: providerRef, amount: amountCents / 100 },
      { Authorization: 'Bearer ' + PaymentProvider.key(`${this.keyPrefix}_API_KEY`) }
    );
    return { providerRef, status: res.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING', sandbox: false, raw: res };
  }
}

module.exports = MobileMoneyProvider;