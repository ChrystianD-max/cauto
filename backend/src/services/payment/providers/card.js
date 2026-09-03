const PaymentProvider = require('../PaymentProvider');

// Cartes bancaires (Visa/Mastercard) via un processeur configurable
// (ex : Stripe, Paystack, Flutterwave, Konnect). Clés uniquement en env.
class CardProvider extends PaymentProvider {
  constructor() {
    super({ code: 'CARD', method: 'CARD', label: 'Carte bancaire', country: 'BJ' });
  }

  isConfigured() {
    return !!(PaymentProvider.key('CARD_API_KEY') && PaymentProvider.key('CARD_API_URL'));
  }

  async begin({ amountCents, currency = 'XOF', idempotencyKey, metadata = {} }) {
    if (this.isTestMode()) {
      return {
        providerRef: PaymentProvider.ref('card'),
        status: 'PENDING',
        sandbox: true,
        paymentUrl: '/pay/sandbox/card',
        extra: { processor: PaymentProvider.key('CARD_PROVIDER') || 'CONSOLE_PAY' }
      };
    }
    const res = await PaymentProvider.httpPost(
      PaymentProvider.key('CARD_API_URL'),
      { amount: amountCents / 100, currency, idempotency_key: idempotencyKey, ...(metadata.card || {}) },
      { Authorization: 'Bearer ' + PaymentProvider.key('CARD_API_KEY') }
    );
    return {
      providerRef: res.reference || PaymentProvider.ref('card'),
      status: 'PENDING',
      sandbox: false,
      paymentUrl: res.checkout_url || null,
      extra: { processor: PaymentProvider.key('CARD_PROVIDER') || 'CARD' }
    };
  }

  async verify({ providerRef, amountCents }) {
    if (this.isTestMode()) {
      return { providerRef, status: 'SUCCEEDED', sandbox: true };
    }
    const res = await PaymentProvider.httpPost(
      PaymentProvider.key('CARD_API_URL') + '/verify',
      { reference: providerRef, amount: amountCents / 100 },
      { Authorization: 'Bearer ' + PaymentProvider.key('CARD_API_KEY') }
    );
    return { providerRef, status: res.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'PENDING', sandbox: false, raw: res };
  }
}

module.exports = CardProvider;