// Module 70 — ARCHITECTURE IA : service MaintenanceAI.
//
// Façade métier du suivi d'entretien. Décision (score, échéances, alertes,
// prochaine opération) issue des règles ; un fournisseur externe n'ajoute
// qu'un insight. Ne modifie JAMAIS un état métier (lecture seule).
class MaintenanceAI {
  constructor(manager) {
    this.manager = manager;
  }

  async overview(vehicle) {
    return this.manager.run('maintenance', { vehicle });
  }
}

module.exports = MaintenanceAI;
