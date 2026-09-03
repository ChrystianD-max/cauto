// Module 70 — ARCHITECTURE IA : abstraction fournisseur d'IA.
//
// Interface commune à tout fournisseur IA (règles déterministes OU LLM externe).
// L'application ne référence JAMAIS un fournisseur en dur : elle passe par
// AIManager.getProvider(). Chaque fournisseur expose les 4 capacités métier :
//   diagnose({ text, category, dtcCodes, history })
//   maintenance({ vehicle, rules })
//   analyzeQuote({ quote, items, history })
//   vehicleHistory({ vehicle, entries, diags, interventions, warranty })
//
// CONTRAT CRITIQUE : la propriété `decision` (décision engageante : urgence,
// statut, montant, score, éligibilité…) est produite par les RÈGLES métier du
// fournisseur `rules`. Un fournisseur de type `external` ne peut produire que
// la propriété `insight` (explication, reformulation), jamais une décision
// critique. Les clés API ne viennent JAMAIS du code ni de la base : uniquement
// process.env / config.
class AIProvider {
  constructor({ code, label, kind }) {
    this.code = code;          // 'rules' | 'openai' | 'anthropic'
    this.label = label;        // libellé humain
    this.kind = kind || 'rules'; // 'rules' (décisionnel) | 'external' (insight uniquement)
  }

  getCode() { return this.code; }
  getLabel() { return this.label; }
  getKind() { return this.kind; }

  // Un fournisseur décisionnel (rules) est TOUJOURS disponible.
  isConfigured() { return false; }

  // Mode test : en démo, ou fournisseur non configuré, on ne fait JAMAIS
  // d'appel externe réel.
  isTestMode() {
    return !this.isConfigured();
  }

  // Les 4 capacités. Le fournisseur `rules` les implémente réellement ; les
  // fournisseurs externes n'implémentent que _insight et délèguent le reste.
  async diagnose() { return this._externalOnly('diagnose'); }
  async maintenance() { return this._externalOnly('maintenance'); }
  async analyzeQuote() { return this._externalOnly('analyzeQuote'); }
  async vehicleHistory() { return this._externalOnly('vehicleHistory'); }

  _externalOnly(cap) {
    throw new Error(`Fournisseur ${this.code} : aucune décision pour la capacité ` + cap);
  }

  // Point d'entrée générique d'enrichissement pour les fournisseurs externes.
  async _insight() { throw new Error('_insight() non implémenté pour ' + this.code); }

  // Appel HTTP générique vers un fournisseur externe (mode réel uniquement).
  static httpPost(url, body, headers = {}) {
    const mod = /^https:/.test(url) ? require('https') : require('http');
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const payload = JSON.stringify(body);
      const req = mod.request({
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
          if (res.statusCode >= 400) return reject(new Error(`fournisseur ${url} HTTP ${res.statusCode}: ${d.slice(0, 300)}`));
          resolve(j);
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

module.exports = AIProvider;
