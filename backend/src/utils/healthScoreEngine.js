// Module 72 — Score santé véhicule (VehicleHealthScoreService) : moteur de
// scoring déterministe et EXPLICABLE. Chaque sous-score est calculé à partir
// de données réelles et porte un « basis » qui explique les déductions.
//
// Doctrine : un sous-score n'est produit QUE si les données nécessaires
// existent. Sinon l'état est « INSUFFICIENT_DATA » (Données insuffisantes).
// Le score global est la moyenne pondérée des sous-scores disponibles ; sans
// aucun sous-score, il est lui aussi « Données insuffisantes ».
const { overview } = require('./maintenanceEngine');

const DOMAINS = [
  { key: 'entretien', label: 'Entretien', weight: 0.30, source: 'maintenance' },
  { key: 'freinage', label: 'Freinage', weight: 0.20, source: 'diagnostic:freinage' },
  { key: 'batterie', label: 'Batterie', weight: 0.15, source: 'diagnostic:batterie' },
  { key: 'suspension', label: 'Suspension', weight: 0.15, source: 'diagnostic:suspension' },
  { key: 'historique', label: 'Historique', weight: 0.20, source: 'history' }
];

// Pénalité par session de diagnostic selon l'urgence conclue.
const URGENCY_PENALTY = { HAUTE: 25, MOYENNE: 15, BASSE: 5 };

function clamp(a, b) { return Math.max(a, b); }

function scoreFromUrgencies(sessions) {
  const raw = 100 - sessions.reduce((acc, s) => {
    const p = URGENCY_PENALTY[s.result_urgency] || 5;
    return acc + p;
  }, 0);
  return clamp(raw, 30);
}

function insufficient(label) {
  return {
    domain: label,
    state: 'INSUFFICIENT_DATA',
    score: null,
    basis: ['Données insuffisantes']
  };
}

// ——— Sous-score Entretien ———
function entretienScore(vehicle, maint) {
  const decision = (maint && maint.decision) || {};
  if (typeof decision.score !== 'number') return insufficient('Entretien');
  const alerts = decision.alerts || [];
  const overdue = alerts.filter((a) => a.overdue).length;
  const soon = alerts.filter((a) => a.dueSoon).length;
  return {
    domain: 'Entretien',
    state: 'OK',
    score: decision.score,
    weight: 0.30,
    basis: [
      `Score d'entretien calculé sur ${alerts.length} opération(s) hors échéance (${overdue} retardée(s), ${soon} proche(s) de l'échéance).`
    ]
  };
}

// ——— Sous-score domaine diagnostic (freinage / batterie / suspension) ———
function diagnosticDomainScore(label, weight, sessions) {
  if (!sessions || sessions.length === 0) return insufficient(label);
  const score = scoreFromUrgencies(sessions);
  const hautes = sessions.filter((s) => s.result_urgency === 'HAUTE').length;
  const moyennes = sessions.filter((s) => s.result_urgency === 'MOYENNE').length;
  const recents = sessions.filter((s) => (Date.now() - new Date(s.created_at).getTime()) < 180 * 86400000).length;
  return {
    domain: label,
    state: 'OK',
    score,
    weight,
    basis: [
      `Basé sur ${sessions.length} diagnostic(s) de la catégorie (${hautes} à urgence haute, ${moyennes} à urgence moyenne, ${recents} datant de moins de 6 mois).`
    ]
  };
}

// ——— Sous-score Historique ———
function historiqueScore(entries, interventions) {
  const hCount = (entries || []).length;
  const iCount = (interventions || []).length;
  if (hCount === 0 && iCount === 0) return insufficient('Historique');
  // Moins il y a d'incidents/interventions à forte portée, meilleur est le score.
  const eventCount = hCount + iCount;
  const incidents = (entries || []).filter((e) => /INCIDENT|PANNE|ACCIDENT|URGENCE|REPARATION A/i.test(e.entry_type || '')).length;
  const raw = 100 - Math.min(40, incidents * 10 + (iCount > 8 ? 10 : 0));
  return {
    domain: 'Historique',
    state: 'OK',
    score: clamp(raw, 30),
    weight: 0.20,
    basis: [
      `${eventCount} événement(s) d'historique et ${iCount} intervention(s) ; ${incidents} incident(s)/réparation(s) majeure(s) répertorié(s).`
    ]
  };
}

// ——— Score global explicable ———
async function computeHealthScore({ vehicle, sessions, entries, interventions, maint }) {
  const ent = entretienScore(vehicle, maint);
  const fre = diagnosticDomainScore('Freinage', 0.20, (sessions || []).filter((s) => s.category === 'freinage'));
  const bat = diagnosticDomainScore('Batterie', 0.15, (sessions || []).filter((s) => s.category === 'batterie'));
  const sus = diagnosticDomainScore('Suspension', 0.15, (sessions || []).filter((s) => s.category === 'suspension'));
  const his = historiqueScore(entries, interventions);

  const sub = [ent, fre, bat, sus, his];
  const available = sub.filter((s) => s.state === 'OK');
  const subscores = sub.map((s) => s.score === null
    ? { domain: s.domain, score: null, state: 'INSUFFICIENT_DATA', basis: ['Données insuffisantes'] }
    : { domain: s.domain, score: s.score, state: 'OK', basis: s.basis });

  if (available.length === 0) {
    return {
      state: 'INSUFFICIENT_DATA',
      score: null,
      message: 'Données insuffisantes',
      subscores
    };
  }

  // Moyenne pondérée sur les sous-scores disponibles (re-normalisation des poids).
  const weightSum = available.reduce((acc, s) => acc + s.weight, 0);
  const global = Math.round(available.reduce((acc, s) => acc + s.score * (s.weight / weightSum), 0));

  return {
    state: 'OK',
    score: global,
    message: `${global}/100`,
    subscores,
    global_basis: available.map((s) => `${s.domain} : ${s.score}/100`)
  };
}

module.exports = {
  DOMAINS,
  computeHealthScore,
  entretienScore,
  diagnosticDomainScore,
  historiqueScore
};
