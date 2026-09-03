const PaymentProvider = require('../PaymentProvider');

// Espèces (en atelier) : aucun appel externe, confirmation manuelle.
class CashProvider extends PaymentProvider {
  constructor() {
    super({ code: 'CASH', method: 'CASH', label: 'Espèces', country: 'BJ' });
  }

  isConfigured() { return true; }

  async begin({ amountCents, idempotencyKey, metadata = {} }) {
    return {
      providerRef: PaymentProvider.ref('cash'),
      status: 'PENDING',
      sandbox: true,
      extra: { requiresManualConfirmation: true, reference: metadata.reference || null }
    };
  }

  async verify({ providerRef, amountCents }) {
    return { providerRef, status: 'PENDING', sandbox: true, extra: { waitingManualConfirmation: true } };
  }
}

module.exports = CashProvider;