const PaymentProvider = require('../PaymentProvider');
const db = require('../../../db');
const { HttpError } = require('../../../utils/errors');

// Portefeuille C-AUTO : interne à la plateforme, aucun fournisseur externe.
// Le débit est atomique (UPDATE conditionné), suivi dans transactions (journal).
class CautoWalletProvider extends PaymentProvider {
  constructor() {
    super({ code: 'CAUTO_WALLET', method: 'CAUTO_WALLET', label: 'Portefeuille C-AUTO', country: 'BJ' });
  }

  isConfigured() { return true; }

  static async getBalance(userId) {
    await db.query(
      `INSERT INTO cauto_wallets (user_id, balance_cents) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`, [userId]
    );
    const row = await db.one('SELECT balance_cents AS balance FROM cauto_wallets WHERE user_id=$1', [userId]);
    return row.balance;
  }

  async begin({ userId, amountCents, idempotencyKey, metadata = {} }) {
    if (!userId) throw new HttpError(400, 'Compte requis pour le paiement par portefeuille');
    await db.query(
      `INSERT INTO cauto_wallets (user_id, balance_cents) VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`, [userId]
    );
    const debited = await db.query(
      `UPDATE cauto_wallets SET balance_cents = balance_cents - $1, updated_at = now()
       WHERE user_id = $2 AND balance_cents >= $1 RETURNING balance_cents`,
      [amountCents, userId]
    );
    if (debited.rowCount === 0) throw new HttpError(402, 'Solde du portefeuille insuffisant');

    const ledgerRef = 'wlt_debit_' + idempotencyKey;
    await db.query(
      `INSERT INTO transactions (reference, type, direction, amount_cents, status, user_id, initiated_by, external_ref)
       VALUES ($1, 'PAYMENT', 'OUT', $2, 'SUCCEEDED', $3, $3, $4)
       ON CONFLICT (reference) DO NOTHING`,
      [ledgerRef, amountCents, userId, metadata.reference || null]
    );
    return {
      providerRef: PaymentProvider.ref('wallet'),
      status: 'SUCCEEDED',
      sandbox: false,
      extra: { balanceAfter: debited.rows[0].balance_cents, method: 'CAUTO_WALLET' }
    };
  }

  async verify({ providerRef }) {
    return { providerRef, status: 'SUCCEEDED', sandbox: false };
  }

  async refund({ payment, note = 'annulation' }) {
    const owner = await db.one(
      `SELECT v.owner_id FROM interventions i JOIN vehicles v ON v.id = i.vehicle_id WHERE i.id = $1`,
      [payment.intervention_id]
    ).catch(() => null);
    if (!owner) return { refunded: false, note: 'propriétaire introuvable' };
    const ref = 'wlt_refund_' + payment.id;
    const done = await db.query(
      `INSERT INTO transactions (reference, type, direction, amount_cents, status, user_id, payment_id, external_ref)
       VALUES ($1, 'REFUND', 'IN', $2, 'SUCCEEDED', $3, $4, $5)
       ON CONFLICT (reference) DO NOTHING RETURNING id`,
      [ref, payment.amount_cents, owner.owner_id, payment.id, note]
    );
    if (done.rowCount === 0) return { refunded: false, note: 'déjà remboursé' };
    await db.query(
      `UPDATE cauto_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE user_id = $2`,
      [payment.amount_cents, owner.owner_id]
    );
    return { refunded: true };
  }
}

module.exports = CautoWalletProvider;