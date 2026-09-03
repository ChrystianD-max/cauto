// Module 70 — ARCHITECTURE IA : service VehicleHistoryAI.
//
// Façade métier de synthèse de l'historique véhicule (append-only). Produit un
// résumé et un état de santé descriptifs à partir des règles ; un fournisseur
// externe n'ajoute qu'une reformulation. Ne mute jamais l'historique.
class VehicleHistoryAI {
  constructor(manager) {
    this.manager = manager;
  }

  async summarize({ vehicle, entries, diags, interventions, warranty }) {
    return this.manager.run('vehicleHistory', { vehicle, entries, diags, interventions, warranty });
  }
}

module.exports = VehicleHistoryAI;
