// Module 74 — TRAÇABILITÉ : journal immutable des réparations.
//
// Pour chaque réparation, un enregistrement `repair_trace` couvre
// QUI / QUOI / QUAND / VÉHICULE / KILOMÉTRAGE / PIÈCE / RÉFÉRENCE / PRIX /
// RÉSULTAT / GARANTIE. La table est append-only (trigger forbid_mutation).
//
// Deux écritures sont produites à la clôture :
//   - une entrée « REPARATION » (résumé de la réparation) ;
//   - une entrée « REPARATION_PART » par ligne pièce du devis approuvé.
const db = require('../db');

const TRACE_COLS = [
  'repair_order_id', 'intervention_id', 'vehicle_id', 'professional_id', 'actor_id',
  'action', 'occurred_at', 'odometer_km', 'part_label', 'part_reference',
  'part_qty', 'unit_price_cents', 'total_price_cents', 'result', 'warranty_id', 'details'
];

function insertTrace(client, row) {
  const cols = TRACE_COLS.filter((c) => row[c] !== undefined && row[c] !== null);
  const vals = cols.map((c) => row[c]);
  const ph = cols.map((_, i) => '$' + (i + 1)).join(',');
  return client.query(`INSERT INTO repair_trace (${cols.join(',')}) VALUES (${ph})`, vals);
}

// Récupère les données liées à une intervention pour bâtir la trace.
async function loadRepairContext(interventionId) {
  const intervention = await db.one('SELECT * FROM interventions WHERE id=$1', [interventionId]);
  const repairOrder = await db.one(
    'SELECT * FROM repair_orders WHERE intervention_id=$1', [interventionId]
  ).catch(() => null);
  const qualityCheck = await db.one(
    'SELECT * FROM quality_checks WHERE intervention_id=$1', [interventionId]
  ).catch(() => null);
  const quote = await db.one(
    'SELECT * FROM quotes WHERE intervention_id=$1', [interventionId]
  ).catch(() => null);
  const quoteItems = quote
    ? await db.many('SELECT * FROM quote_items WHERE quote_id=$1', [quote.id]).catch(() => [])
    : [];
  const warranty = await db.one(
    'SELECT * FROM warranties WHERE intervention_id=$1', [interventionId]
  ).catch(() => null);
  return { intervention, repairOrder, qualityCheck, quote, quoteItems, warranty };
}

// Écrit le journal complet de clôture d'une réparation (résumé + pièces).
// Appeler dans une transaction `tx` pour rester cohérent avec la clôture.
async function traceRepairClosure(tx, interventionId, actorId) {
  const ctx = await loadRepairContext(interventionId);
  const { intervention, repairOrder, qualityCheck, quoteItems, warranty } = ctx;

  const base = {
    intervention_id: intervention.id,
    repair_order_id: repairOrder ? repairOrder.id : null,
    vehicle_id: intervention.vehicle_id,
    professional_id: intervention.professional_id,
    actor_id: actorId,
    occurred_at: new Date(),
    odometer_km: qualityCheck ? qualityCheck.odometer_km : null,
    warranty_id: warranty ? warranty.id : null
  };

  // Entrée récapitulative de la réparation.
  await insertTrace(tx, {
    ...base,
    action: 'REPARATION',
    result: (qualityCheck && qualityCheck.result) || 'OK',
    total_price_cents: quoteItems.reduce((acc, it) => acc + Math.round(Number(it.unit_price_cents) * Number(it.qty)), 0),
    details: {
      received_ok: true,
      road_test_ok: qualityCheck ? !!qualityCheck.road_test_ok : true,
      part_count: quoteItems.length,
      replaced_parts: qualityCheck ? qualityCheck.replaced_parts : null
    }
  });

  // Une entrée par ligne pièce (PIÈCE / RÉFÉRENCE / PRIX).
  for (const item of quoteItems) {
    if (item.kind !== 'PARTS') continue;
    await insertTrace(tx, {
      ...base,
      action: 'REPARATION_PART',
      part_label: item.label,
      part_reference: item.part_reference || null,
      part_qty: item.qty,
      unit_price_cents: item.unit_price_cents,
      total_price_cents: Math.round(Number(item.unit_price_cents) * Number(item.qty)),
      result: (qualityCheck && qualityCheck.result) || 'OK',
      details: { label: item.label }
    });
  }
  return ctx;
}

// Récupère le journal de traçabilité d'un véhicule (lecture).
async function getVehicleTrace(vehicleId, limit = 50) {
  return db.many(
    `SELECT rt.*, u.name AS actor_name, p.name AS pro_name
     FROM repair_trace rt
     LEFT JOIN users u ON u.id = rt.actor_id
     LEFT JOIN professionals pr ON pr.id = rt.professional_id
     LEFT JOIN users p ON p.id = pr.user_id
     WHERE rt.vehicle_id = $1
     ORDER BY rt.occurred_at DESC, rt.created_at DESC
     LIMIT $2`,
    [vehicleId, limit]
  ).catch(() => []);
}

module.exports = {
  traceRepairClosure,
  getVehicleTrace,
  loadRepairContext
};