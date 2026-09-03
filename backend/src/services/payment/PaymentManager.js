const { HttpError } = require('../../utils/errors');

// Registre des fournisseurs de paiement. L'application ne référence
// jamais un fournisseur en dur : elle passe par getProviderForMethod().
class PaymentManager {
  constructor() {
    this.providers = [];
  }

  register(provider) {
    this.providers.push(provider);
    return this;
  }

  getAll() { return this.providers; }

  getProvider(code) {
    return this.providers.find((p) => p.getCode() === code);
  }

  getProviderForMethod(method, preferredCode) {
    const byMethod = this.providers.filter((p) => p.getMethod() === method);
    if (preferredCode) {
      const picked = byMethod.find((p) => p.getCode() === preferredCode);
      if (picked) return picked;
    }
    if (byMethod.length === 1) return byMethod[0];
    const configured = byMethod.find((p) => p.isConfigured());
    return configured || byMethod[0];
  }

  listMethods() {
    const map = {};
    for (const p of this.providers) {
      map[p.getMethod()] = map[p.getMethod()] || [];
      map[p.getMethod()].push({
        code: p.getCode(),
        label: p.getLabel(),
        country: p.country,
        configured: p.isConfigured(),
        testMode: p.isTestMode()
      });
    }
    return Object.entries(map).map(([method, providers]) => ({ method, providers }));
  }

  async begin(method, opts) {
    const provider = this.getProviderForMethod(method, opts.providerCode);
    if (!provider) throw new HttpError(400, 'Méthode de paiement inconnue : ' + method);
    return { provider, result: await provider.begin(opts) };
  }
}

module.exports = PaymentManager;