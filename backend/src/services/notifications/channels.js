const PaymentProvider = require('../payment/PaymentProvider');
const config = require('../../config');
const WebPushService = require('./WebPushService');

// Banque d'adaptateurs de canaux. Chaque canal déclare sa disponibilité
// (clés API en environnement) ; ISend échoue => fallback vers le canal suivant.
// MODE DÉMONSTRATION : les canaux externes (SMS, e-mail, WhatsApp) ne sont
// jamais disponibles — tout passe par le canal interne CHAT C-AUTO. Le canal
// PUSH (Web Push navigateur) fonctionne lui partout (il dépend de VAPID).

class NotificationChannel {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }
  configured() { return false; }
  async send() { throw new Error('send() non implémenté'); }
}

class ChatChannel extends NotificationChannel {
  constructor() { super('CHAT', 'Chat C-AUTO'); }
  configured() { return true; }
  async send({ message, title = 'C-AUTO' }) {
    return { delivered: true, synthetic: true, body: `${title} : ${message}` };
  }
}

class PushChannel extends NotificationChannel {
  constructor() { super('PUSH', 'Notification push'); }
  configured() { return WebPushService.isConfigured(); }
  async send({ message, title = 'C-AUTO', userId, url }) {
    if (!this.configured()) throw new Error('Push non configuré (VAPID_PRIVATE_KEY manquant)');
    const r = await WebPushService.sendToUser(userId, { title, body: message, url: url || '/app' });
    // Sans abonnement actif on fait échouer le canal pour poursuivre la chaîne
    // de fallback vers les autres canaux configurés.
    if (!r.sent) throw new Error('Aucun abonnement push actif');
    return { delivered: true, sent: r.sent, removed: r.removed, synthetic: false };
  }
}

class SmsChannel extends NotificationChannel {
  constructor() { super('SMS', 'SMS'); }
  configured() { return !config.demoMode && !!(PaymentProvider.key('SMS_API_URL') && PaymentProvider.key('SMS_API_KEY')); }
  async send({ message, userId, meta }) {
    if (!this.configured()) throw new Error('SMS non configuré (SMS_API_URL/SMS_API_KEY manquants)');
    if (!meta) throw new Error('Numéro de téléphone manquant');
    return PaymentProvider.httpPost(
      PaymentProvider.key('SMS_API_URL'),
      { to: meta, message, sender: PaymentProvider.key('SMS_SENDER') || 'CAUTO' },
      { Authorization: 'Bearer ' + PaymentProvider.key('SMS_API_KEY') }
    );
  }
}

class EmailChannel extends NotificationChannel {
  constructor() { super('EMAIL', 'E-mail'); }
  configured() { return !config.demoMode && !!(PaymentProvider.key('EMAIL_API_URL') && PaymentProvider.key('EMAIL_API_KEY')); }
  async send({ message, title = 'C-AUTO', userId, meta }) {
    if (!this.configured()) throw new Error('E-mail non configuré (EMAIL_API_URL/EMAIL_API_KEY manquants)');
    if (!meta) throw new Error('Adresse e-mail manquante');
    return PaymentProvider.httpPost(
      PaymentProvider.key('EMAIL_API_URL'),
      { to: meta, subject: title, html: `<p>${message.replace(/\n/g, '<br/>')}</p>` },
      { Authorization: 'Bearer ' + PaymentProvider.key('EMAIL_API_KEY') }
    );
  }
}

class WhatsAppChannel extends NotificationChannel {
  constructor() { super('WHATSAPP', 'WhatsApp'); }
  configured() { return !config.demoMode && !!(PaymentProvider.key('WHATSAPP_API_URL') && PaymentProvider.key('WHATSAPP_API_KEY')); }
  async send({ message, userId, meta }) {
    if (!this.configured()) throw new Error('WhatsApp non configuré (WHATSAPP_API_URL/WHATSAPP_API_KEY manquants)');
    if (!meta) throw new Error('Numéro WhatsApp manquant');
    return PaymentProvider.httpPost(
      PaymentProvider.key('WHATSAPP_API_URL'),
      { to: meta, message, template: PaymentProvider.key('WHATSAPP_TEMPLATE') || 'cauto_plain' },
      { Authorization: 'Bearer ' + PaymentProvider.key('WHATSAPP_API_KEY') }
    );
  }
}

const CHANNELS = { CHAT: 'CHAT', PUSH: 'PUSH', SMS: 'SMS', EMAIL: 'EMAIL', WHATSAPP: 'WHATSAPP' };

function buildChannels() {
  return [
    new ChatChannel(),
    new PushChannel(),
    new SmsChannel(),
    new EmailChannel(),
    new WhatsAppChannel()
  ];
}

module.exports = { NotificationChannel, ChatChannel, PushChannel, SmsChannel, EmailChannel, WhatsAppChannel, buildChannels, CHANNELS };