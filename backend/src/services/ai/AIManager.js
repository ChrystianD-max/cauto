// Module 70 — ARCHITECTURE IA : registre des fournisseurs d'IA.
//
// L'application ne référence jamais un fournisseur en dur : elle passe par
// getActive() / getProvider(). Le fournisseur actif est choisi par la
// configuration (config.ai.provider) et peut être remplacé sans toucher aux
// services métier (DiagnosticAI, MaintenanceAI, QuoteAnalysisAI,
// VehicleHistoryAI).
class AIManager {
  constructor({ config, logger }) {
    this.providers = [];
    this.config = config || { ai: { provider: 'rules' } };
    this.logger = logger || console;
  }

  register(provider) {
    this.providers.push(provider);
    return this;
  }

  getAll() { return this.providers; }

  getProvider(code) {
    return this.providers.find((p) => p.getCode() === code) || null;
  }

  // Fournisseur décisionnel de référence : toujours le fournisseur de règles,
  // quel que soit le fournisseur actif. Les décisions critiques en viennent.
  getRulesProvider() {
    return this.getProvider('rules');
  }

  // Fournisseur actif (celui configuré par AI_PROVIDER).
  getActive() {
    const code = (this.config.ai && this.config.ai.provider) || 'rules';
    const active = this.getProvider(code);
    if (active) return active;
    if (this.logger && this.logger.warn) {
      this.logger.warn({ msg: 'ai_provider_unknown_fallback', code, fallback: 'rules' });
    }
    // Dégradation sûre : jamais d'appel externe imprévu.
    return this.getRulesProvider();
  }

  // Choix d'une capacité : renvoie un objet { provider, decision, insight }.
  //   - Le fournisseur actif produit la capacité (decisions + éventuel insight).
  //   - En mode démo / fournisseur non configuré, on bascule sur rules.
  // Retourne le couple décision/insight prêt à consommer par les services.
  async run(cap, ctx) {
    const active = this.getActive();
    const mock = this.config.demoMode || active.isTestMode();
    const provider = mock ? this.getRulesProvider() : active;

    let result;
    let externalInsight = null;
    if (provider.getKind() === 'rules') {
      result = await provider[cap](ctx);
    } else {
      // Fournisseur externe : décision = règles de référence ; insight = LLM.
      const rules = this.getRulesProvider();
      const decision = await rules[cap](ctx);
      let insight = null;
      try {
        insight = await provider._insight(cap, { ctx, decision });
      } catch (e) {
        if (this.logger && this.logger.warn) {
          this.logger.warn({ msg: 'ai_insight_failed', cap, err: String(e && e.message || e) });
        }
      }
      result = { ...decision, insight };
      externalInsight = insight;
    }

    // Métadonnées : quel fournisseur a réellement décidé.
    result = result || {};
    result.provider = { code: provider.getCode(), label: provider.getLabel(), kind: provider.getKind() };
    if (externalInsight !== null) result.external = true;
    return result;
  }

  listCapabilities() {
    return this.providers.map((p) => ({
      code: p.getCode(),
      label: p.getLabel(),
      kind: p.getKind(),
      configured: p.isConfigured(),
      testMode: p.isTestMode()
    }));
  }
}

module.exports = AIManager;
