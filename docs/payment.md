# Paiements — C-AUTO

## 1. Méthodes & fournisseurs

`backend/src/services/payment/index.js` — méthodes `PAYMENT_METHODS = ['MOBILE_MONEY','CARD','CASH','CAUTO_WALLET']`.

| Fournisseur (`code`) | Méthode | Config requise | Comportement test/pas configuré |
|---|---|---|---|
| `MTN_MOMO`, `MOOV_MONEY`, `WAVE`, `ORANGE_MONEY` | `MOBILE_MONEY` | `<CODE>_API_KEY` + `<CODE>_API_URL` | `paymentUrl /pay/sandbox/<code>` + `simCode` 6 chiffres, `PENDING` |
| `CARD` | `CARD` | `CARD_API_KEY` + `CARD_API_URL` (`extra.processor = CARD_PROVIDER \|\| 'CONSOLE_PAY'`) | `/pay/sandbox/card`, `PENDING` |
| `CASH` | `CASH` | toujours configuré | `PENDING`, `requiresManualConfirmation: true`, sans appel externe |
| `CAUTO_WALLET` | `CAUTO_WALLET` | interne | réel (wallet interne) |

Base classe `PaymentProvider` : `begin({amountCents, currency, idempotencyKey, userId, metadata})`, `verify`, `refund` (no-op par défaut). Clés **uniquement** dans `process.env`.

**`isTestMode()`** : `DEMO_MODE` **a toujours priorité** (aucun débit réel), sinon `PAYMENT_MODE=sandbox`, sinon fournisseur non configuré. En mode démo, `/api/config` et `integrationStatus` rapportent `{mode:'simulated', live:false, sandbox:true}`.

## 2. Intention de paiement — `POST /api/payments/intent`

- **En-tête `Idempotency-Key` obligatoire** (8–128 caractères sinon 400) ;
- réutilisation : si un paiement existe avec la même clé → renvoyé avec `reused:true` ;
- validations : intervention appartenant au demandeur, `status='CLOSED'`, contenant un devis `APPROVED` ;
- montant = `quote.total_cents`, devise = `CountryService.defaultCurrency()` ;
- `paymentManager.begin(method, …)` → insertion `payments(idempotency_key UNIQUE, provider_ref UNIQUE, method)` ; en cas d'échec, rollback wallet si `CAUTO_WALLET` ;
- réponse : `checkout_url || '/pay/<id>'`, `sandbox`, `demo`, `provider`, `extra`.

Wallet : `begin` débite atomiquement `cauto_wallets.balance_cents` (402 si solde insuffisant), journalise `transactions` (`type PAYMENT`, sens OUT, `SUCCEEDED`, référence `wlt_debit_<clé>` dédup `ON CONFLICT (reference) DO NOTHING`).

## 3. Webhook — `POST /api/payments/webhooks/payment`

- **Public** (déclaré avant `requireAuth`), protégé par `x-webhook-secret === PAYMENT_WEBHOOK_SECRET` ;
- corps `{event_id (6–200), payment_id (uuid), status ∈ ['succeed','fail','abort']}` ;
- **déduplication** : insertion `payment_events(event_id UNIQUE, payment_id, payload)` via `ON CONFLICT (event_id) DO NOTHING RETURNING id` → si aucune ligne insérée : `{duplicate:true}` ;
- mapping : `succeed→SUCCEEDED`, `fail→FAILED`, `abort→ABORTED` ; mise à jour **uniquement** si `payments.status = 'PENDING'` (sinon « statut déjà appliqué ») ;
- si statut ≠ SUCCEEDED et méthode `CAUTO_WALLET` → remboursement automatique (`wlt_refund_<payment.id>`).

## 4. Création de la garantie au succès

Dans la même transaction (webhook ou simulation sandbox `POST /api/payments/:id/confirm`) :

1. `warranties` : `months=12`, `starts_on=CURRENT_DATE`, `ends_on = CURRENT_DATE + INTERVAL '12 months'`, pour le véhicule/pro de l'intervention (`ON CONFLICT (intervention_id) DO NOTHING`) ;
2. `history_entries` (type `PAYMENT`, « Paiement confirmé … garantie 12 mois activée ») — table **immuable** ;
3. `repair_trace` action `WARRANTY_CREATED` (immuable) ;
4. notification dédupliquée `pay:<id>:succeeded`.

## 5. Sandbox

`POST /api/payments/:id/confirm { outcome: succeed|fail|abort }` (rôle client/propriétaire) réinjecte l'événement via `processPaymentEvent` avec `eventId='evt_sbx_<aléa>'` — permet de tester succès, refus et interruption sans passerelle réelle. `POST /api/payments/wallet/topup` crédite un wallet simulé (ADJUSTMENT).

## 6. Règles d'intégrité

- `payments.idempotency_key` et `provider_ref` **UNIQUE** ; `payment_events.event_id` **UNIQUE** ;
- aucun débit réel en `DEMO_MODE` ; `PAYMENT_MODE=live` produit des appels réels hors démo ;
- commissions (`commissions`) dérivées des paiements (console admin).