// Moteur de règles de diagnostic (déterministe, hors-ligne).
//
// Applique la doctrine d'expertise automobile :
//   SYMPTÔME ≠ CODE DÉFAUT ≠ CAUSE ≠ COMPOSANT DÉFECTUEUX.
// Un code défaut ne désigne JAMAIS automatiquement un composant à remplacer :
// il décrit une condition mesurée par un calculateur, qui appelle des contrôles
// de CONFIRMATION avant toute pièce.
const dtc = require('./dtcKnowledge');

const CATEGORIES = {
  moteur: { keywords: ['moteur','acceleration','calage','vibration','fumee','surchauffe','huile','turbo','allumage','bobine','injecteur','knock','tapotement'], base_causes: ['Bougie d\'allumage défectueuse','Injecteur bouché','Fuite d\'huile moteur','Courroie de distribution usée','Turbo défaillant','Capteur PMH défectueux','Dépassement kilométrique huile'] },
  boite: { keywords: ['boite','vitesse','rapport','passage','grincement','calage boite','embrayage'], base_causes: ['Embrayage usé','Synchronisateur défaillant','Fuite d\'huile boîte','Actuateur solénoïde défectueux','Câble de sélection usé','Palier de boîte'] },
  embrayage: { keywords: ['embrayage','patinage','accrochage','pedale','vibrations'], base_causes: ['Disque d\'embrayage usé','Butée de débrayage défectueuse','Ressort de pression fatigué','Volant moteur bifilier défaillant'] },
  freinage: { keywords: ['frein','freinage','pédale',' ABS','poussée','sifflement','vibration frein','distance'], base_causes: ['Plaquettes de frein usées','Disque de frein voilé','Fuite de liquide de frein','Maitre-cylindre défaillant','ABS capteur défectueux','Etrier grippé'] },
  direction: { keywords: ['direction','braquage','volant','point mort','bruit direction','fuite assisté'], base_causes: ['Pompe de direction assistée défaillante','Tierods usés','Rotule de direction','Biellette de stabilisateur','Fuite huile direction'] },
  suspension: { keywords: ['suspension','amortisseur','roulis','comfort','rebond','cliquetis'], base_causes: ['Amortisseur HS','Ressort cassé','Silentbloc usé','Rotule de suspension','Barre stabilisatrice'] },
  climatisation: { keywords: ['clim','climatisation','froid','chaud','gate','soufflant','refroidissement'], base_causes: ['Gaz réfrigérant manquant','Compresseur défectueux','Fuite circuit clim','Radiateur colmaté','Sonde température'] },
  batterie: { keywords: ['batterie','demarrage','tension','charge','alternateur','ne démarre pas','sousse tension'], base_causes: ['Batterie vidée','Alternateur en panne','Câble de batterie oxydé','Démarreur défaillant','Fuite de courant'] },
  electricite: { keywords: ['électrique','fusible','voyant','court-circuit','installation','lumière','commodo'], base_causes: ['Fusible grillé','Court-circuit dans le faisceau','Module électronique HS','Capteur défectueux','Masse oxydée'] },
  pneus: { keywords: ['pneu','pneumatique','usure','gonflage','perforation','équilibre','parallélisme'], base_causes: ['Pneu usé de manière irrégulière','Pression incorrecte','Péroration','Jante voilée','Parallélisme déréglé'] },
  voyant: { keywords: ['voyant','temoin','allume','clignote','voyant moteur','voyant ABS','voyant airbag'], base_causes: ['Capteur défectueux','Erreurs enregistrées (DTC)','Problème émetteur','Faisceau endommagé'] },
  bruit: { keywords: ['bruit','bruyant','sifflement','cliquetis','grincement','ronflement','tonneau'], base_causes: ['Palier de roue HS','Courroie accessoire usée','Amortisseur défaillant','Echappement percé','Support moteur cassé'] },
  autre: { keywords: ['autre','divers','non classé','spécifique'], base_causes: ['Nécessite inspection visuelle','Problème non identifié','Consultez un professionnel'] }
};

function extractCategory(text) {
  const lower = text.toLowerCase();
  let best = 'autre';
  let bestScore = 0;
  for (const [cat, conf] of Object.entries(CATEGORIES)) {
    const score = conf.keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

// Convertit une cause DTC (label + prob) en hypothèse utilisable.
function toHypothesis(cause) {
  return {
    label: cause.label,
    probability: cause.prob,
    explanation: cause.tip || 'Cause probable relevée d\'après le(s) code(s) défaut.'
  };
}

function addCommonControls(controls, category) {
  if (category === 'moteur') controls.push('Analyse des gaz d\'échappement');
  if (category === 'freinage') controls.push('Mesure d\'épaisseur des disques et plaquettes');
  if (category === 'batterie') controls.push('Test de charge de la batterie et de l\'alternateur');
  return controls;
}

function analyseSymptoms(text, category, dtcCodes, vehicleHistory) {
  const lower = text.toLowerCase();
  const conf = CATEGORIES[category] || CATEGORIES.autre;
  const hasDtc = dtcCodes && dtcCodes.length > 0;

  // Résolution des codes défaut selon la doctrine « code ≠ cause ».
  const dtcInfo = dtc.resolve(dtcCodes);
  const dtcCauses = [];
  const dtcTests = [];
  for (const entry of dtcInfo.codes) {
    for (const c of entry.causes || []) dtcCauses.push(c);
    for (const t of entry.tests || []) dtcTests.push(t);
  }
  // Dédoublonne les causes par label en cumulant probabilité maximale.
  const causeMap = new Map();
  for (const c of dtcCauses) {
    const key = c.label;
    if (!causeMap.has(key) || causeMap.get(key).prob < c.prob) causeMap.set(key, c);
  }
  const resolvedCauses = [...causeMap.values()].sort((a, b) => b.prob - a.prob);

  const urgency = (lower.includes('surchauffe') || lower.includes('fumée') || lower.includes('perde') ||
    lower.includes('ne démarre') || lower.includes('abs') || dtcInfo.severityMax === 'CRITIQUE') ? 'HAUTE' :
    (lower.includes('bruit') || lower.includes('vibration') || lower.includes('voyant') || dtcCodes.length > 0) ? 'MOYENNE' : 'BASSE';

  const hasHistory = vehicleHistory && vehicleHistory.length > 0;
  const keywordsFound = conf.keywords.filter(k => lower.includes(k));

  const confidence = dtcCodes.length > 0 ? 'ÉLEVÉ' :
    (keywordsFound.length >= 3 || hasHistory) ? 'MOYEN' : 'FAIBLE';

  // Hypothèses : les codes défauts résolus priment s'ils existent (avec la
  // note « code ≠ composant » portée par chaque cause via son `tip`).
  let hypotheses;
  if (resolvedCauses.length) {
    hypotheses = resolvedCauses.slice(0, 4).map(toHypothesis);
  } else {
    hypotheses = conf.base_causes.slice(0, 4).map((cause, i) => ({
      label: cause,
      probability: Math.max(90 - i * 15, 30),
      explanation: `Basé sur les symptômes: "${keywordsFound.slice(0, 3).join(', ')}"${hasDtc ? ' et les codes défaut: ' + dtcCodes.join(', ') : ''}`
    }));
  }

  const controls = dtcTests.length
    ? dtcTests.map((t, i) => `${i + 1}. ${t.label} (attendu : ${t.expected})`)
    : ['Inspection visuelle des composants concernés',
       'Lecture des codes défaut (si disponible)',
       'Vérification des niveaux (huile, liquide de frein, refroidissant)',
       'Essai routier avec observation'];
  addCommonControls(controls, category);

  const comprehension = `Votre ${category} présente des symptômes de type: ${keywordsFound.join(', ') || 'non identifié'}. ` +
    `${hasDtc ? 'Des codes défaut ont été détectés: ' + dtcCodes.join(', ') + '. ' : ''}` +
    `${hasHistory ? 'L\'historique du véhicule montre des interventions antérieures sur cette zone. ' : ''}` +
    `Niveau d'urgence: ${urgency}.`;

  // ----- Doctrine expliquée (Méthode des 14 étapes + code ≠ cause) -----
  const criticalCauses = resolvedCauses.filter((c) => c.critical).map((c) => c.label);
  const rootCauseAlt = resolvedCauses.filter((c) => c.tip).map((c) => ({
    cause: c.label,
    alternative: c.tip
  }));

  const result = {
    result_comprehension: comprehension,
    result_hypotheses: hypotheses,
    result_causes: resolvedCauses.length ? resolvedCauses.slice(0, 5).map((c) => c.label) : conf.base_causes.slice(0, 3),
    result_controls: controls,
    result_urgency: urgency,
    result_confidence: confidence,

    // --- Extensions expert (ajoutés sans casser le contrat) ---
    result_doctrine: dtc.DOCTRINE,
    result_dtc: dtcInfo.codes.map((entry) => ({
      code: entry.code,
      known: entry.known,
      interpretation: entry.interpretation,
      severity: entry.severity,
      causes: (entry.causes || []).sort((a, b) => b.prob - a.prob),
      tests: entry.tests || []
    })),
    result_method: {
      headline: dtc.SUMMARY.principle,
      steps: dtc.SUMMARY.symptoms,
      appliedSteps: [
        { step: 1, label: 'Symptôme', value: keywordsFound.join(', ') || text?.slice(0, 80) || 'Decrire le symptome' },
        { step: 3, label: 'Système concerné', value: category },
        { step: 4, label: 'Causes possibles', value: (resolvedCauses.length ? resolvedCauses : conf.base_causes.slice(0, 4)).slice(0, 4).map((c) => (typeof c === 'string' ? c : c.label)) },
        { step: 5, label: 'Causes les plus probables', value: hypotheses.slice(0, 3).map((h) => `${h.label} (${h.probability} %)`) },
        { step: 6, label: 'Causes critiques à éliminer en priorité', value: criticalCauses.length ? criticalCauses : ['Aucune cause critique identifiée — traiter la cause la plus probable en priorité'] },
        { step: 8, label: 'Contrôles à effectuer', value: controls.slice(0, 6) },
        { step: 11, label: 'Confirmation de la panne', value: 'Confirmer par les contrôles ci-dessus avant toute réparation' }
      ]
    },
    result_critical_causes: criticalCauses,
    result_confirmation: {
      principle: 'On ne remplace une pièce qu\'après confirmation par un test (jamais sur la seule foi d\'un code).',
      plan: [
        'Réaliser les contrôles ci-dessus et relever les mesures',
        'Comparer aux valeurs attendues du constructeur',
        'Permuter / tester le composant suspect avant de l\'acquérir',
        'Après réparation : effacer les codes, faire un essai routier et revérifier l\'absence de code'
      ]
    },
    result_root_cause_alt: rootCauseAlt,
    result_reduce_parts: {
      message: 'Réduire les remplacements inutiles : chaque code/produit est une hypothèse, jamais une évidence.',
      alternatives_found: rootCauseAlt.length,
      low_cost_first: (resolvedCauses.length ? resolvedCauses : hypotheses)
        .slice()
        .sort((a, b) => a.prob - b.prob)
        .slice(0, 3)
        .map((c) => (typeof c === 'string' ? c : c.label))
    }
  };

  return result;
}

module.exports = { extractCategory, analyseSymptoms, CATEGORIES };
