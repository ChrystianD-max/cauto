// Module 70 — ARCHITECTURE IA : base de connaissance des codes défaut.
//
// Objectif : appliquer la doctrine « SYMPTÔME ≠ CODE ≠ CAUSE ≠ COMPOSANT ».
// Un code défaut (DTC) décrit une CONDITION mesurée par un calculateur, jamais
// directement un composant à remplacer. Ce module fournit, de façon DÉTERMINISTE
// (sans base ni réseau), pour chaque code connu :
//   - son interpretation (ce que mesure réellement le calculateur) ;
//   - sa sévérité (CRITIQUE / ELEVEE / MOYENNE / BASSE) ;
//   - les causes probables ordonnées (probabilité + criticité) ;
//   - les tests/contrôles à réaliser pour CONFIRMER avant tout remplacement ;
//   - un rappel systématique de la « cause racine alternative » (ex. un capteur
//     qui se déclenche à cause d'un défaut MÉCANIQUE, pas du capteur lui-même).
//
// Les entrées sont volontairement minimalistes mais exactes ; ce module est la
// connaissance de référence consommée par le fournisseur de règles.

const SEVERITY = Object.freeze({
  CRITIQUE: 'CRITIQUE',
  ELEVEE: 'ELEVEE',
  MOYENNE: 'MOYENNE',
  BASSE: 'BASSE'
});

// Chaque cause : { label, prob (0-100), critical (bool), tip (cause racine alt.) }
// Chaque test : { label, expected, interpretation }
const CODES = {
  // ---------- Powertrain (P) ----------
  P0100: {
    interpretation: 'Débitmètre d\'air (MAF) : signal hors plage haute ou basse.',
    severity: 'MOYENNE',
    causes: [
      { label: 'Capteur MAF encrassé ou défaillant', prob: 70, critical: false, tip: 'Un filtre à air colmaté encrasse le MAF sans que le capteur soit défectueux.' },
      { label: 'Fuite d\'air après le MAF (admission)', prob: 55, critical: false, tip: 'Une durite d\'admission percée fausse la mesure MAF.' },
      { label: 'Problème de câblage/masse du capteur', prob: 30, critical: false, tip: null },
      { label: 'Panne du calculateur moteur (rare)', prob: 10, critical: true, tip: 'À n\'éliminer qu\'après exclusion des causes ci-dessus.' }
    ],
    tests: [
      { label: 'Inspection du filtre à air et nettoyage du capteur', expected: 'débit stable après nettoyage', interpretation: 'Si le symptôme disparaît : cause = encrassement, pas le capteur.' },
      { label: 'Contrôle de tension signal MAF au ralenti', expected: '0.5-1.5 V (ou fréquence proportionnelle)', interpretation: 'Hors plage en statique ⇒ signal douteux avant de conclure.' },
      { label: 'Recherche de fuite d\'admission (fumée)', expected: 'aucune fuite détectée', interpretation: 'Une fuite explique un mélange pauvre ET un MAF anormal.' }
    ]
  },
  P0170: {
    interpretation: 'Défaut de richesse (mélange air/carburant) hors limite corrigée.',
    severity: 'MOYENNE',
    causes: [
      { label: 'Fuite d\'air ou d\'admission', prob: 60, critical: false, tip: 'Cause mécanique fréquente avant tout suspect du capteur.' },
      { label: 'Débitmètre MAF ou sonde lambda encrassés', prob: 50, critical: false, tip: 'Souvent une conséquence, pas la cause racine.' },
      { label: 'Pression de carburant anormale (pompe/régulateur)', prob: 40, critical: false, tip: null },
      { label: 'Injecteur colmaté ou qui fuit', prob: 35, critical: false, tip: null }
    ],
    tests: [
      { label: 'Lecture des valeurs live de richesse (STFT/LTFT)', expected: 'corrections dans ±10 %', interpretation: 'Correction > 10 % ⇒ chercher une fuite avant de changer quoi que ce soit.' },
      { label: 'Contrôle de la pression de carburant', expected: 'conforme constructeur', interpretation: 'Basse ⇒ pompe/régulateur ; haute ⇒ retour bouché.' },
      { label: 'Inspection admission + test d\'étanchéité', expected: 'aucune fuite', interpretation: 'Élimine la première cause avant toute pièce.' }
    ]
  },
  P0171: {
    interpretation: 'Mélange trop pauvre (banque 1) détecté.',
    severity: 'ELEVEE',
    causes: [
      { label: 'Fuite d\'air après le débitmètre', prob: 65, critical: false, tip: 'Durite, collecteur, joint de papillon : cause mécanique prioritaire.' },
      { label: 'Débitmètre MAF sous-estime le débit', prob: 45, critical: false, tip: null },
      { label: 'Pression carburant insuffisante (filtre/pompe)', prob: 40, critical: false, tip: null },
      { label: 'Sonde lambda défaillante (fake lean)', prob: 30, critical: false, tip: 'Un signal lambda erroné IMITE une pauvreté inexistante.' }
    ],
    tests: [
      { label: 'Recherche de fuite d\'admission (fumée / spray)', expected: 'aucune fuite', interpretation: 'Cause n°1 : à éliminer en priorité.' },
      { label: 'Relevé STFT/LTFT à plusieurs régimes', expected: 'corrections positives < 15 %', interpretation: 'Fortes corrections positives ⇒ fuite ou carburant.' },
      { label: 'Vérification pression carburant', expected: 'conforme', interpretation: 'Écart ⇒ chaîne d\'alimentation avant le lambda.' }
    ]
  },
  P0300: {
    interpretation: 'Ratés d\'allumage multiples / aléatoires détectés.',
    severity: 'ELEVEE',
    causes: [
      { label: 'Bougies usées ou écart inadapté', prob: 70, critical: false, tip: 'Cause la plus fréquente et la moins coûteuse.' },
      { label: 'Bobines d\'allumage faibles', prob: 50, critical: false, tip: null },
      { label: 'Fuite d\'air ou mélange pauvre', prob: 45, critical: false, tip: 'Un raté aléatoire peut être un problème de richesse, pas d\'allumage.' },
      { label: 'Injecteurs encrassés', prob: 40, critical: false, tip: null },
      { label: 'Compression inégale (moteur)', prob: 20, critical: true, tip: 'Compression basse = cause MÉCANIQUE, à éliminer avant de remplacer l\'électronique.' }
    ],
    tests: [
      { label: 'Test de compression moteur', expected: 'écart < 10 % entre cylindres', interpretation: 'Écart élevé ⇒ cause mécanique, ne pas remplacer l\'allumage.' },
      { label: 'Inspection bougies (couleur/écart)', expected: 'usure régulière, écart conforme', interpretation: 'Bougie noire/huileuse oriente vers huile ou richesse.' },
      { label: 'Test bobines par permutation', expected: 'le raté suit la bobine ?', interpretation: 'Si le raté suit un cylindre ⇒ bobine/injecteur ; sinon mécanique/riche.' },
      { label: 'Lecture live des compteurs de ratés', expected: 'identifier le ou les cylindres', interpretation: 'Isoler le cylindre avant toute action.' }
    ]
  },
  P0301: {
    interpretation: 'Raté d\'allumage sur le cylindre 1.',
    severity: 'ELEVEE',
    causes: [
      { label: 'Bobine d\'allumage cylindre 1', prob: 65, critical: false, tip: 'Vérifier par permutation avant remplacement.' },
      { label: 'Bougie cylindre 1', prob: 55, critical: false, tip: null },
      { label: 'Injecteur cylindre 1 encrassé', prob: 35, critical: false, tip: null },
      { label: 'Compression anormale cylindre 1', prob: 25, critical: true, tip: 'Cause mécanique possible malgré un code « allumage ».' }
    ],
    tests: [
      { label: 'Permutation bobine/bougie vers un autre cylindre', expected: 'le raté se déplace ?', interpretation: 'S\'il se déplace ⇒ composant échangé ; sinon cause ailleurs (produit, compression).' },
      { label: 'Test de compression cylindre 1', expected: 'conforme aux autres', interpretation: 'Bas ⇒ fuite de soupape/ segment, PAS un défaut d\'allumage.' },
      { label: 'Contrôle du connecteur injecteur cyl 1', expected: 'alimentation présente', interpretation: 'Un connecteur oxydé coupe l\'injection même avec une bobine neuve.' }
    ]
  },
  P0400: {
    interpretation: 'Défaut du circuit de recirculation des gaz (EGR).',
    severity: 'MOYENNE',
    causes: [
      { label: 'Vanne EGR encrassée/calaminée', prob: 70, critical: false, tip: 'Cause n°1, nettoyage souvent suffisant.' },
      { label: 'Conduits EGR obstrués', prob: 45, critical: false, tip: null },
      { label: 'Électrovanne/capteur de position EGR', prob: 30, critical: false, tip: null },
      { label: 'Problème de dépression (si pilotage pneumatique)', prob: 25, critical: false, tip: null }
    ],
    tests: [
      { label: 'Démonter et inspecter la vanne EGR', expected: 'peu ou pas de calamine', interpretation: 'Si colmatage ⇒ nettoyage, N\'ACHETER PAS de vanne neuve d\'emblée.' },
      { label: 'Tester la course de la vanne (actuateur)', expected: 'course complète sans accroc', interpretation: 'Bloquée ⇒ nettoyage/lubrification avant remplacement.' },
      { label: 'Contrôle des conduits EGR', expected: 'libres', interpretation: 'Obstruction = cause racine du code.' }
    ]
  },
  P0420: {
    interpretation: 'Efficacité du catalyseur sous le seuil (banque 1).',
    severity: 'MOYENNE',
    causes: [
      { label: 'Catalyseur dégradé (chimiquement mort)', prob: 55, critical: false, tip: null },
      { label: 'Sonde lambda aval (post-cat) défaillante', prob: 40, critical: false, tip: 'Un faux signal lambda fait croire à un catalyseur mort.' },
      { label: 'Ratés d\'allumage ayant empoisonné le catalyseur', prob: 35, critical: false, tip: 'Cause RACINE possible : traiter le raté, pas seulement le catalyseur.' },
      { label: 'Fuite d\'échappement avant le catalyseur', prob: 30, critical: false, tip: null }
    ],
    tests: [
      { label: 'Comparaison amplitude signal pre/post catalyseur', expected: 'ratio d\'efficacité correct', interpretation: 'Sonde aval trop « plate » = sonde ou fuite, pas forcément le catalyseur.' },
      { label: 'Inspection de l\'échappement (fuites)', expected: 'aucune fuite', interpretation: 'Une fuite devant le catalyseur fausse le calcul d\'efficacité.' },
      { label: 'Vérification de l\'absence de ratés récurrents', expected: 'aucun raté', interpretation: 'Traitement de la cause racine AVANT le remplacement du catalyseur.' }
    ]
  },
  P0500: {
    interpretation: 'Signal du capteur de vitesse véhicule (VSS) absent ou incohérent.',
    severity: 'MOYENNE',
    causes: [
      { label: 'Capteur VSS défaillant', prob: 60, critical: false, tip: null },
      { label: 'Câblage/connecteur du capteur', prob: 45, critical: false, tip: 'Un connecteur oxydé efface le signal sans capteur défectueux.' },
      { label: 'Problème de capteur ABS de roue (source VSS)', prob: 35, critical: false, tip: 'Le VSS peut provenir de l\'ABS : vérifier l\'ABS avant.' },
      { label: 'Vitesse indiquée fausse (télématic/odomètre)', prob: 20, critical: false, tip: null }
    ],
    tests: [
      { label: 'Mesure du signal VSS au connecteur', expected: 'impulsions au roulage', interpretation: 'Signal présent ⇒ capteur OK, chercher le consommateur.' },
      { label: 'Contrôle d\'intégrité du faisceau/masse', expected: 'continuité, pas de corrosion', interpretation: 'Oxydation = cause fréquente de « faux défaut capteur ». ' },
      { label: 'Vérification des codes ABS associés', expected: 'aucun code ABS', interpretation: 'Co-défaut ABS ⇒ relier au circuit VSS/roue.' }
    ]
  },
  P0113: {
    interpretation: 'Capteur de température d\'air d\'admission (IAT) : signal trop haut.',
    severity: 'BASSE',
    causes: [
      { label: 'Connecteur du capteur IAT oxydé/débranché', prob: 55, critical: false, tip: 'Vérifier le connecteur AVANT le capteur.' },
      { label: 'Capteur IAT défaillant (circuit ouvert)', prob: 40, critical: false, tip: null },
      { label: 'Câblage coupé ou court-circuit', prob: 30, critical: false, tip: null }
    ],
    tests: [
      { label: 'Mesure de la résistance du capteur IAT', expected: 'évolue avec la température', interpretation: 'Constante ⇒ capteur ; mais vérifier le connecteur d\'abord.' },
      { label: 'Inspection du connecteur', expected: 'propre, verrouillé', interpretation: 'Cause fréquente et gratuite.' }
    ]
  },
  P0110: {
    interpretation: 'Capteur de température d\'air d\'admission (IAT) : circuit anormal.',
    severity: 'BASSE',
    causes: [
      { label: 'Connecteur/câblage IAT', prob: 50, critical: false, tip: null },
      { label: 'Capteur IAT défectueux', prob: 40, critical: false, tip: null }
    ],
    tests: [
      { label: 'Contrôle de continuité du circuit', expected: 'continu, pas de court', interpretation: 'Isoler la cause avant remplacement.' }
    ]
  },
  P0335: {
    interpretation: 'Capteur de position de vilebrequin (CKP) : aucun signal.',
    severity: 'ELEVEE',
    causes: [
      { label: 'Capteur CKP défaillant', prob: 50, critical: false, tip: null },
      { label: 'Entrefers/cible volante magnétique encrassée', prob: 40, critical: false, tip: 'Cause mécanique : copeaux magnétiques ou cible endommagée.' },
      { label: 'Câblage / connecteur CKP', prob: 35, critical: false, tip: null },
      { label: 'Problème de distribution (décalage)', prob: 15, critical: true, tip: 'À vérifier si le signal est présent mais incohérent.' }
    ],
    tests: [
      { label: 'Oscilloscope / valeur live CKP au démarrage', expected: 'impulsions nettes au lancement', interpretation: 'Pas de signal ⇒ capteur/câblage ; signal irrégulier ⇒ cible/mécanique.' },
      { label: 'Inspection de la cible et de l\'entrefer', expected: 'propre, entrefer conforme', interpretation: 'Une cible endommagée = cause racine mécanique.' }
    ]
  },

  // ---------- Chassis (C) ----------
  C0035: {
    interpretation: 'Capteur de vitesse de roue avant gauche (ABS) : circuit anormal.',
    severity: 'MOYENNE',
    causes: [
      { label: 'Capteur ABS encrassé ou défaillant', prob: 55, critical: false, tip: 'Encrassement par poussière de frein avant tout.' },
      { label: 'Câblage / connecteur du capteur', prob: 40, critical: false, tip: 'Un faisceau usé par le passage de roue efface le signal.' },
      { label: 'Cible (couronne) endommagée ou absente', prob: 30, critical: false, tip: 'Cause mécanique possible.' },
      { label: 'Fuite de liquide / roulement HS', prob: 20, critical: false, tip: 'Un roulement fatigué fausse la vitesse de roue.' }
    ],
    tests: [
      { label: 'Mesure du signal ABS à la roue (multimètre/scope)', expected: 'impulsions au tour de roue', interpretation: 'Signal absent ⇒ contrôle câblage/cible avant le capteur.' },
      { label: 'Inspection du faisceau + connecteur', expected: 'pas de coupure', interpretation: 'Coupure = cause gratuite à réparer.' }
    ]
  },

  // ---------- Body (B) ----------
  B0001: {
    interpretation: 'Défaut du circuit de retenue (airbag conducteur).',
    severity: 'CRITIQUE',
    causes: [
      { label: 'Connecteur de prétension/airbag déconnecté', prob: 50, critical: false, tip: 'Après une intervention, un connecteur oublié est la cause n°1.' },
      { label: 'Spire de contact (clock spring) usée', prob: 35, critical: false, tip: 'Cause classique, mais vérifier câblage avant.' },
      { label: 'Unité de retenue (SRSCM) défaillante', prob: 15, critical: true, tip: 'Dernier recours : à n\'éliminer qu\'après le câblage.' }
    ],
    tests: [
      { label: 'Diagnostic à l\'outil + lecture spécifique du défaut', expected: 'défaut de circuit précis', interpretation: 'Directionner vers haut/bas par l\'outil.' },
      { label: 'Inspection des connecteurs sous siège/bandeau', expected: 'verrouillés, propres', interpretation: 'Cause la plus fréquente et la plus simple.' }
    ]
  },

  // ---------- Réseau (U) ----------
  U0100: {
    interpretation: 'Perte de communication avec le calculateur moteur (ECM) sur le réseau CAN.',
    severity: 'ELEVEE',
    causes: [
      { label: 'Alimentation/masse du calculateur absente', prob: 40, critical: false, tip: 'Vérifier fusibles et masses AVANT de suspecter le calculateur.' },
      { label: 'Connecteur du calculateur / faisceau', prob: 35, critical: false, tip: 'Coupure, oxydation, épissure cassée.' },
      { label: 'Charge trop élevée sur le CAN (court H/L)', prob: 30, critical: false, tip: null },
      { label: 'Calculateur ECM lui-même défaillant', prob: 15, critical: true, tip: 'Dernier recours : un ECM « ne communique pas » est souvent un problème d\'alim, pas de l\'ECM.' }
    ],
    tests: [
      { label: 'Contrôle fusibles + tensions d\'alim au connecteur ECM', expected: 'tension + ignition présente', interpretation: 'Absence d\'alim = cause racine avant tout remplacement.' },
      { label: 'Mesure de résistance du CAN H/L (60 Ω)', expected: '≈ 60 Ω entre H et L', interpretation: 'Hors plage ⇒ court/coupure sur le réseau, pas l\'ECM.' },
      { label: 'Vérification des masses du compartiment moteur', expected: 'propres, < 0.1 Ω', interpretation: 'Une mauvaise masse fait littéralement disparaître l\'ECM du CAN.' }
    ]
  }
};

// Doctrine universelle, appliquée à TOUS les codes : le code signale une
// CONDITION, jamais directement un composant à remplacer.
const DOCTRINE = 'Un code défaut décrit une condition mesurée par un calculateur. ' +
  'Il n\'implique JAMAIS automatiquement que le composant portant ce nom doit être remplacé : ' +
  'chaque code appelle des contrôles de CONFIRMATION avant toute pièce.';

const SUMMARY = Object.freeze({
  symptoms: [
    '1. Symptôme relevé',
    '2. Condition d\'apparition',
    '3. Système concerné',
    '4. Causes possibles (brainstorm)',
    '5. Causes les plus probables',
    '6. Causes critiques à éliminer en priorité',
    '7. Données nécessaires',
    '8. Contrôles à effectuer',
    '9. Mesures attendues',
    '10. Interprétation des résultats',
    '11. Confirmation de la panne',
    '12. Réparation appropriée',
    '13. Contrôles après réparation',
    '14. Cause racine différente du composant défectueux'
  ],
  principle: 'Principe de réduction des remplacements : on ne remplace une pièce qu\'après ' +
    'l\'avoir CONFIRMÉE par un test, jamais sur la seule foi d\'un code. En cas de doute, ' +
    'éliminer d\'abord la cause la plus probable et la moins coûteuse.'
});

function normalize(code) {
  if (!code) return null;
  return String(code).trim().toUpperCase();
}

// Retourne l'entrée de connaissance pour un code, ou une entrée « générique »
// (P/C/B/U) dérivée de la structure du code si le code précis est inconnu.
function lookup(code) {
  const c = normalize(code);
  if (!c) return null;
  if (CODES[c]) return { code: c, ...CODES[c], known: true };

  // Fallback générique par famille : on ne connaît pas la cause précise, on
  // fournit une interprétation prudente et un renvoi vers la méthode.
  const fam = c[0];
  const generic = {
    P: { system: 'Groupe motopropulseur', interpretation: 'Défaut du groupe motopropulseur.' },
    C: { system: 'Châssis', interpretation: 'Défaut du châssis.' },
    B: { system: 'Carrosserie', interpretation: 'Défaut de la carrosserie.' },
    U: { system: 'Réseau (CAN/communication)', interpretation: 'Défaut de communication réseau.' }
  }[fam];
  return {
    code: c,
    known: false,
    interpretation: (generic ? `${generic.system} — ` : 'Famille de code inconnue — ') + 'code non renseigné dans la base C-AUTO.',
    severity: 'BASSE',
    causes: [
      { label: `Contrôler d'abord l'état du câblage et des connecteurs du circuit (${c})`, prob: 50, critical: false, tip: 'Cause fréquente et gratuite : oxydation, coupure, mauvaise masse.' },
      { label: 'Vérifier par la méthode des 14 étapes avant tout remplacement', prob: 45, critical: false, tip: 'Un code seul ne désigne jamais le composant à remplacer (doctrine).' }
    ],
    tests: [
      { label: 'Relevé des valeurs live et conditions d\'apparition', expected: 'données de contexte', interpretation: 'Contextualiser le code avant toute action.' },
      { label: 'Contrôle d\'alimentation, masse et signal du circuit', expected: 'conformes', interpretation: 'Éliminer les causes électriques/mécaniques avant la pièce.' }
    ]
  };
}

// Résout une liste de codes en une structure enrichie conforme à la doctrine.
// Retourne { codes, interpretations, severityMax, causes (agrégées), tests,
//           note }.
function resolve(dtcCodes = []) {
  const resolved = [];
  let severityMax = 'BASSE';
  for (const raw of (dtcCodes || [])) {
    const entry = lookup(raw);
    if (!entry) continue;
    resolved.push(entry);
    const order = ['BASSE', 'MOYENNE', 'ELEVEE', 'CRITIQUE'];
    if (order.indexOf(entry.severity) > order.indexOf(severityMax)) severityMax = entry.severity;
  }
  return {
    codes: resolved,
    severityMax,
    interpreted: resolved.length > 0
  };
}

module.exports = { CODES, SEVERITY, DOCTRINE, SUMMARY, lookup, resolve, normalize };
