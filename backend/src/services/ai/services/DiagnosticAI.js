// Module 70 — ARCHITECTURE IA : service DiagnosticAI.
//
// Façade métier du pré-diagnostic. Consomme le fournisseur IA actif via
// AIManager. La décision (catégorie, urgence, hypothèses, confiance) provient
// TOUJOURS des règles métier ; un éventuel fournisseur externe n'ajoute qu'un
// `insight` explicatif, jamais une décision.
const diag = require('../../../utils/diagnosticService');

class DiagnosticAI {
  constructor(manager) {
    this.manager = manager;
  }

  // Retourne { ...analyses } enrichis éventuellement d'un insight externe.
  async analyse({ text, category, dtcCodes = [], vehicleHistory = [] }) {
    return this.manager.run('diagnose', { text, category, dtcCodes, vehicleHistory });
  }

  // Catégories de règles (indépendantes du fournisseur actif).
  static get CATEGORIES() { return diag.CATEGORIES; }

  // Déduction de catégorie par les règles (utilisée pour normaliser l'entrée).
  static extractCategory(text) { return diag.extractCategory(text); }
}

module.exports = DiagnosticAI;
