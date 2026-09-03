// Module 72 — ARCHITECTURE IA : service VehicleHealthScoreAI.
//
// Façade métier du score santé véhicule. Décision (score global + sous-scores
// explicables) issue du moteur de règles déterministe healthScoreEngine ; un
// fournisseur externe n'ajoute qu'un insight. Ne modifie JAMAIS d'état métier.
const healthScore = require('../../../utils/healthScoreEngine');

class VehicleHealthScoreAI {
  constructor(manager) {
    this.manager = manager;
  }

  async compute({ vehicle, sessions, entries, interventions, maint }) {
    return healthScore.computeHealthScore({ vehicle, sessions, entries, interventions, maint });
  }
}

module.exports = VehicleHealthScoreAI;
