// Pré-diagnostic à base de règles (déterministe, aucune donnée externe)
const RULES = [
  {
    match: ['demarre pas', 'démarrage', 'batterie', ' démarreur'],
    severity: 'MOYENNE',
    causes: ['Batterie déchargée ou en fin de vie', 'Démarreur usé', 'Alternateur défaillant'],
    recommendations: ["Tester la tension batterie (12,6 V au repos)", "Contrôler les cosses et le circuit de charge"]
  },
  {
    match: ['frein', 'freine', 'grincement pédale'],
    severity: 'HAUTE',
    causes: ['Plaquettes usées', 'Disques voilés', 'Liquide de frein à remplacer'],
    recommendations: ['Contrôle immédiat des plaquettes et disques', 'Purge du liquide de frein si > 2 ans']
  },
  {
    match: ['surchauffe', 'temperature moteur', 'température', 'vapeur'],
    severity: 'HAUTE',
    causes: ['Radiateur bouché ou fuyard', 'Thermostat bloqué', 'Pompe à eau usée'],
    recommendations: ['Arrêter le véhicule, ne plus rouler', 'Contrôle du circuit de refroidissement']
  },
  {
    match: ['voyant', 'témoin allumé'],
    severity: 'MOYENNE',
    causes: ['Code défaut moteur (OBD)', 'Capteur défaillant'],
    recommendations: ['Lecture OBD-II pour identifier le code défaut']
  },
  {
    match: ['bruit moteur', 'claquement', 'sifflement'],
    severity: 'MOYENNE',
    causes: ['Courroie ou galet usé', 'Jeu soupapes', 'Échappement percé'],
    recommendations: ['Diagnostic sonore en atelier recommandé']
  },
  {
    match: ['fuite', 'tache sous la voiture', 'huile'],
    severity: 'MOYENNE',
    causes: ['Joint spy moteur ou boîte', 'Filtre à huile mal serré', 'Durite refroidissement'],
    recommendations: ['Identifier le fluide (couleur/odeur)', 'Contrôle des niveaux']
  },
  {
    match: ['direction', 'volant dur', 'tremble volant'],
    severity: 'MOYENNE',
    causes: ['Direction assistée faible', 'Géométrie à régler', 'Rotules usées'],
    recommendations: ['Contrôle géométrie + suspension']
  },
  {
    match: ['climatisation', 'clim', 'chauffage'],
    severity: 'BASSE',
    causes: ['Recharge gaz nécessaire', 'Compresseur HS'],
    recommendations: ['Test pression circuit clim']
  }
];

function analyze(description) {
  const text = description.toLowerCase();
  const hits = RULES.filter((r) => r.match.some((kw) => text.includes(kw)));
  if (hits.length === 0) {
    return {
      severity: 'A_DEFINIR',
      summary: 'Symptôme non reconnu par les règles locales. Diagnostic professionnel requis.',
      causes: ['Origine indéterminée'],
      recommendations: ['Prise de rendez-vous en atelier pour diagnostic complet']
    };
  }
  const primary = hits[0];
  return {
    severity: primary.severity,
    summary: `Symptômes identifiés (${hits.length} piste(s)) : ${hits.map((h) => h.causes[0]).join(' ; ')}.`,
    causes: [...new Set(hits.flatMap((h) => h.causes))],
    recommendations: [...new Set(hits.flatMap((h) => h.recommendations))]
  };
}

module.exports = { analyze };
