const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { audit, auditChange } = require('../middlewares/audit');
const { HttpError, wrap } = require('../utils/errors');
const { paymentManager, PAYMENT_METHODS } = require('../services/payment');
const CautoWalletProvider = require('../services/payment/providers/wallet');
const CountryService = require('../core/countries');
const config = require('../config');
const { status: integrationStatus } = require('../services/mode/integrationStatus');

const router = express.Router();

// ============ Webhook fournisseur (PUBLIC, idempotent) ============
// Déclaré AVANT requireAuth : les fournisseurs n'ont pas de jeton utilisateur.
const WEBHOOK_TOKEN = process.env.PAYMENT_WEBHOOK_SECRET;
router.post('/webhooks/payment', wrap(async (req, res) => {
  if (WEBHOOK_TOKEN && req.headers['x-webhook-secret'] !== WEBHOOK_TOKEN) {
    throw new HttpError(401, 'Secret webhook invalide');
  }
  const s = z.object({
    event_id: z.string().min(6).max(200),
    payment_id: z.string().uuid(),
    status: z.enum(['succeed', 'fail', 'abort'])
  }).safeParse(req.body);
  if (!s.success) throw new HttpError(400, 'Payload webhook invalide', { code: 'VALIDATION_ERROR' });
  const known = await db.one('SELECT id FROM payments WHERE id=$1', [s.data.payment_id]).catch(() => null);
  if (!known) throw new HttpError(404, 'Paiement inconnu');
  const result = await processPaymentEvent(s.data.event_id, s.data.payment_id, s.data.status);
  res.json({ received: true, duplicate: result.duplicate === true });
}));

router.use(requireAuth);

// ============ MÉTHODES DE PAIEMENT (abstraction PaymentProvider) ============
router.get('/methods', wrap(async (req, res) => {
  res.json({
    methods: paymentManager.listMethods(),
    demoMode: config.demoMode,
    payment: integrationStatus().payment
  });
}));

// ============ PORTEFEUILLE C-AUTO ============
router.get('/wallet', wrap(async (req, res) => {
  const balance = await CautoWalletProvider.getBalance(req.user.sub);
  const ledger = await db.many(
    `SELECT reference, type, direction, amount_cents, status, external_ref, created_at
     FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25`,
    [req.user.sub]
  );
  res.json({ wallet: { balance_cents: balance }, ledger: ledger || [] });
}));

// Top-up SIMULÉ (mode sandbox) : alimente le portefeuille via un ADJUSTMENT.
router.post('/wallet/topup', wrap(async (req, res) => {
  const s = z.object({ amount_cents: z.number().int().min(100).max(10000000) }).safeParse(req.body);
  if (!s.success) throw new HttpError(400, 'Montant invalide', { code: 'VALIDATION_ERROR' });
  const { amount_cents } = s.data;
  await db.query(
    `INSERT INTO cauto_wallets (user_id, balance_cents) VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`, [req.user.sub]
  );
  const ref = 'wlt_topup_' + crypto.randomBytes(10).toString('hex');
  await db.query(
    `INSERT INTO transactions (reference, type, direction, amount_cents, status, user_id, initiated_by, external_ref)
     VALUES ($1, 'ADJUSTMENT', 'IN', $2, 'SUCCEEDED', $3, $3, 'sandbox-topup')`, [ref, amount_cents, req.user.sub]
  );
  const updated = await db.query(
    `UPDATE cauto_wallets SET balance_cents = balance_cents + $1, updated_at = now() WHERE user_id = $2 RETURNING balance_cents`,
    [amount_cents, req.user.sub]
  );
  await audit(req, 'payment.wallet_topup', 'wallet', req.user.sub, { amount_cents });
  res.json({ wallet: { balance_cents: updated.rows[0].balance_cents } });
}));

// ============ Traitement idempotent d'un événement de paiement ============
async function processPaymentEvent(eventId, paymentId, statusLabel, actorId) {
  const inserted = await db.one(
    `INSERT INTO payment_events (event_id, payment_id, payload)
     VALUES ($1,$2,$3)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING id`,
    [eventId, paymentId, JSON.stringify({ payment_id: paymentId, status: statusLabel })]
  );
  if (!inserted) return { duplicate: true };

  const map = { succeed: 'SUCCEEDED', fail: 'FAILED', abort: 'ABORTED' };
  const target = map[statusLabel];
  const updated = await db.query(
    `UPDATE payments SET status=$1::payment_status, updated_at=now()
     WHERE id=$2 AND status='PENDING'
     RETURNING *`,
    [target, paymentId]
  );
  if (updated.rowCount === 0) return { duplicate: true, note: 'statut déjà appliqué' };
  const payment = updated.rows[0];

  // Remboursement automatique du portefeuille quand le paiement échoue/est annulé.
  if (target !== 'SUCCEEDED' && payment.method === 'CAUTO_WALLET') {
    const wallet = paymentManager.getProvider('CAUTO_WALLET');
    if (wallet) {
      const refunded = await wallet.refund({ payment, note: statusLabel });
      return { duplicate: false, payment, refund: refunded };
    }
  }

  if (target === 'SUCCEEDED') {
    await db.tx(async (c) => {
      const w = await c.query(
        `INSERT INTO warranties (intervention_id, repair_order_id, vehicle_id, professional_id, created_by,
            months, starts_on, ends_on)
         SELECT i.id, ro.id, i.vehicle_id, i.professional_id, $2::uuid, 12, CURRENT_DATE, CURRENT_DATE + INTERVAL '12 months'
         FROM interventions i
         LEFT JOIN repair_orders ro ON ro.intervention_id = i.id
         WHERE i.id = $1
         ON CONFLICT (intervention_id) DO NOTHING RETURNING id`,
        [payment.intervention_id, actorId || null]
      );
      await c.query(
        `INSERT INTO history_entries (vehicle_id, entry_type, title, details, created_by)
         SELECT vehicle_id, 'PAYMENT', $2, $3, NULL FROM interventions WHERE id=$1`,
        [payment.intervention_id,
          `Paiement confirmé : ${(payment.amount_cents / 100).toFixed(2)} - garantie 12 mois activée`,
          JSON.stringify({ payment_id: payment.id, warranty_created: w.rowCount > 0 })]
      );
      if (w.rowCount > 0) {
        // Traçabilité (Module 74) : documenter la création de la garantie
        // dans le journal immutable de la réparation.
        await c.query(
          `INSERT INTO repair_trace (intervention_id, vehicle_id, professional_id, actor_id,
              repair_order_id, action, result, warranty_id, details)
           SELECT i.id, i.vehicle_id, i.professional_id, $2::uuid, ro.id, 'WARRANTY_CREATED', NULL, w2.id,
                  jsonb_build_object('months', 12, 'ends_on', CURRENT_DATE + INTERVAL '12 months')
           FROM interventions i
           LEFT JOIN repair_orders ro ON ro.intervention_id = i.id
           JOIN warranties w2 ON w2.intervention_id = i.id
           WHERE i.id = $1`,
          [payment.intervention_id, actorId || null]
        );
      }
      const owner = await c.query('SELECT owner_id FROM vehicles WHERE id=(SELECT vehicle_id FROM interventions WHERE id=$1)', [payment.intervention_id]);
      if (owner.rows[0]) {
        await c.query(
          `INSERT INTO notifications (user_id,message,dedupe_key)
           VALUES ($1,$2,$3) ON CONFLICT (dedupe_key) DO NOTHING`,
          [owner.rows[0].owner_id, 'Paiement reçu — votre véhicule peut être récupéré',
            `pay:${payment.id}:succeeded`]
        );
      }
    });
  }
  return { duplicate: false, payment };
}

// ============ Création d'une intention de paiement (SANDBOX) ============
router.post('/intent', wrap(async (req, res) => {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string' || key.length < 8 || key.length > 128) {
    throw new HttpError(400, "En-tête Idempotency-Key requis (8-128 caractères)", { code: 'VALIDATION_ERROR' });
  }
  const s = z.object({
    intervention_id: z.string().uuid(),
    method: z.enum(PAYMENT_METHODS).default('CARD'),
    provider: z.string().max(40).optional()
  }).safeParse(req.body);
  if (!s.success) throw new HttpError(400, 'Payload invalide', { code: 'VALIDATION_ERROR' });
  const { intervention_id, method, provider } = s.data;

  const existing = await db.one('SELECT * FROM payments WHERE idempotency_key=$1', [key]);
  if (existing) return res.json({ payment: existing, reused: true });

  const i = await db.one('SELECT * FROM interventions WHERE id=$1', [intervention_id]);
  if (!i) throw new HttpError(404, 'Intervention introuvable');
  const v = await db.one('SELECT owner_id FROM vehicles WHERE id=$1', [i.vehicle_id]);
  if (v.owner_id !== req.user.sub) throw new HttpError(403, 'Seul le propriétaire paie');
  if (i.status !== 'CLOSED') throw new HttpError(409, "L'intervention doit être clôturée avant paiement");
  const q = await db.one(`SELECT total_cents FROM quotes WHERE intervention_id=$1 AND status='APPROVED'`, [intervention_id]);
  if (!q) throw new HttpError(409, 'Aucun devis validé pour cette intervention');

  // Devise du pays par défaut (module 45) — jamais codée en dur.
  const currency = await CountryService.defaultCurrency();
  const { provider: pv, result } = await paymentManager.begin(method, {
    amountCents: q.total_cents,
    currency: currency.code,
    idempotencyKey: key,
    userId: req.user.sub,
    providerCode: provider || undefined,
    metadata: { intervention_id, reference: `INV-${intervention_id.slice(0, 8).toUpperCase()}` }
  });

  let payment;
  try {
    payment = await db.one(
      `INSERT INTO payments (intervention_id, amount_cents, idempotency_key, provider_ref, provider, method)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [intervention_id, q.total_cents, key, result.providerRef, pv.getCode(), method]
    );
  } catch (err) {
    // Si un débit portefeuille a eu lieu avant l'insertion, on rembourse.
    if (method === 'CAUTO_WALLET') {
      const wallet = paymentManager.getProvider('CAUTO_WALLET');
      try { await wallet.refund({ payment: { id: 'wlt_exec_' + key, intervention_id, amount_cents: q.total_cents }, note: 'rollback' }); } catch (e) {}
    }
    throw err;
  }
  await audit(req, 'payment.intent', 'payment', payment.id, { amount_cents: payment.amount_cents, method });
  res.status(201).json({ payment, checkout_url: result.paymentUrl || `/pay/${payment.id}`, sandbox: result.sandbox === true, demo: config.demoMode ? true : undefined, provider: pv.getCode(), extra: result.extra });
}));

// ============ Simulateur SANDBOX : succès / refusé / interrompu ============
router.post('/:id/confirm', wrap(async (req, res) => {
  const s = z.object({ outcome: z.enum(['succeed', 'fail', 'abort']) }).safeParse(req.body);
  if (!s.success) throw new HttpError(400, 'Outcome invalide', { code: 'VALIDATION_ERROR' });
  const p = await db.one('SELECT * FROM payments WHERE id=$1', [req.params.id]);
  if (!p) throw new HttpError(404, 'Paiement introuvable');
  const i = await db.one('SELECT vehicle_id FROM interventions WHERE id=$1', [p.intervention_id]);
  const v = await db.one('SELECT owner_id FROM vehicles WHERE id=$1', [i.vehicle_id]);
  if (v.owner_id !== req.user.sub) throw new HttpError(403, 'Accès refusé');
  const eventId = 'evt_sbx_' + crypto.randomBytes(12).toString('hex');
  const result = await processPaymentEvent(eventId, p.id, s.data.outcome, req.user.sub);
  await auditChange(req, 'payment.confirm', 'payment', p.id,
    { status: p.status, amount_cents: p.amount_cents, method: p.method },
    result.payment ? { status: result.payment.status, amount_cents: result.payment.amount_cents, method: result.payment.method } : null,
    { outcome: s.data.outcome, refunded: !!result.refund });
  res.json({ event_id: eventId, ...result });
}));

module.exports = { router, processPaymentEvent };