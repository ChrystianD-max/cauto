// Connecteur de messagerie (WhatsApp / SMS) — simulation testable.
// Aucun envoi réel n'est effectué : les messages sont journalisés côté serveur
// et l'état du rappel est mis à jour. En production, remplacer par l'appel
// à Twilio / Meta WhatsApp Business API / provider SMS local.
const logger = require('../observability').logger;

const CHANNELS = ['WHATSAPP', 'SMS'];

function renderTemplate(op) {
  const t = {
    VIN: 'Révision périodique',
    'Changement huile': 'Vidange moteur',
    FILTRE: 'Remplacement filtre à huile',
    PLAQUETTES: 'Contrôle plaquettes de frein',
    BATTERIE: 'Contrôle batterie 12V'
  };
  return t[op] || op;
}

// Envoi simulé. Retourne l'objet statut qui sera enregistré en base.
async function send({ channel, to, template }) {
  const delivered = Math.random() > 0.05; // 95 % de livraison simulée
  logger.info(`[messaging] ${channel} -> ${to} : "${template}" (${delivered ? 'delivered' : 'failed'})`);
  return { status: delivered ? 'DELIVERED' : 'FAILED', sentAt: new Date().toISOString() };
}

module.exports = { CHANNELS, send, renderTemplate };