// Module 70 — ARCHITECTURE IA : service QuoteAnalysisAI.
//
// Façade métier d'analyse de devis. Produit des métriques et alertes
// descriptives (répartition pièces/main-d'œuvre, cohérence) qui aident à la
// lecture, SANS jamais valider ni refuser un devis : l'approbation reste une
// décision explicitement humaine (routes quotes.js) contrôlée par les règles.
class QuoteAnalysisAI {
  constructor(manager) {
    this.manager = manager;
  }

  async analyze({ quote, items }) {
    return this.manager.run('analyzeQuote', { quote, items });
  }
}

module.exports = QuoteAnalysisAI;
