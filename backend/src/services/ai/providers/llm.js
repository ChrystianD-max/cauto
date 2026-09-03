const AIProvider = require('../AIProvider');

const EXPERT_SYSTEM = [
  "Tu es un EXPERT AUTOMOBILE MULTIDISCIPLINAIRE niveau ingenieur/diagnosticien senior C-AUTO.",
  "Combines : technicien automobile, diagnosticien electronique senior, ingenieur automobile, electrotechnicien, systemes embarques CAN/LIN/FlexRay, expert OBD/EOBD/UDS, moteurs, transmissions, hybrides, electriques, ADAS, securite, NVH, maintenance preventive, telematique, qualite, chef d atelier, analyste de donnees.",
  "TA MISSION : diagnostiquer avec methode, expliquer avec clarte, decider avec prudence, reduire au maximum les remplacements de pieces inutiles.",
  "METHODE DES 14 ETAPES : symptome, condition d apparition, systeme concerne, causes possibles, causes probables, causes critiques, donnees, controles, mesures attendues, interpretation, confirmation, reparation, controles apres reparation, cause racine.",
  "DISTINGUE : SYMPTOME != CODE != CAUSE != COMPOSANT. Un code ne signifie JAMAIS que le composant qui porte ce nom doit etre remplace.",
  "GARDE-FOUS : tu ne produis que des INFORMATIONS. JAMAIS de decision engageante (approbation, montant, statut, ordre). Tu ne contredis pas les regles.",
  "Reponds en francais, concis, 4-8 phrases, oriente vers la CONFIRMATION par test avant remplacement."
].join(' ');

class LLMProvider extends AIProvider {
  constructor(o) {
    super({ code: o.code, label: o.label, kind: 'external' });
    this.cfg = o.config || {};
  }
  isConfigured() { return Boolean(this.cfg && this.cfg.key); }
  getModel() { return this.cfg.model || ''; }
  _system() { return EXPERT_SYSTEM; }
  async _insight(cap, obj) {
    var ctx = obj.context || {};
    var decision = obj.decision || {};
    var prompt = this._buildPrompt(cap, ctx, decision);
    var msgs = [{ role: 'system', content: this._system() }, { role: 'user', content: prompt }];
    var res = await this._chat(msgs);
    return { text: res.text, provider: this.cfg.code, model: this.getModel() };
  }
  async _chat(messages) {
    if (this.cfg.code === 'anthropic') {
      var data = await AIProvider.httpPost(this.cfg.baseUrl + '/messages', { model: this.cfg.model, max_tokens: 600, messages: messages }, { 'x-api-key': this.cfg.key, 'anthropic-version': '2023-06-01' });
      return { text: (data.content || []).map(function (b) { return b.text || ''; }).join('') };
    }
    var data = await AIProvider.httpPost(this.cfg.baseUrl + '/chat/completions', { model: this.cfg.model, messages: messages, max_tokens: 600 }, { Authorization: 'Bearer ' + this.cfg.key });
    return { text: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '' };
  }
  _buildPrompt(cap, ctx, decision) {
    var brief = ({
      diagnose: 'Aide au diagnostic (14 etapes). Rappel : un code != cause, verifier par test avant tout remplacement.',
      maintenance: 'Synthetise l etat d entretien et conseille les gestes prioritaires.',
      analyzeQuote: 'Reformule le devis et suggere des questions, SANS valider le prix.',
      vehicleHistory: 'Synthetise l historique et les points de vigilance.'
    })[cap] || 'Aide explicative';
    var h = (decision.result_hypotheses || []).slice(0, 3).map(function (x) { return x.label; }).join(', ');
    var xc = decision.result_critical_causes || [];
    var extra = '';
    if (cap === 'diagnose' && h) { extra += ' Hypotheses priorisees : ' + h + '.'; }
    if (xc.length) { extra += ' Causes critiques a eliminer en priorite : ' + xc.join(', ') + '.'; }
    return brief + ' ' + extra + '\nDECISION des regles (ne pas contredire) : ' + JSON.stringify(decision || {}).slice(0, 1500);
  }
}
module.exports = LLMProvider;