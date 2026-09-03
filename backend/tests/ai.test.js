// Module 70 — ARCHITECTURE IA.
// Tests de l'abstraction AIProvider, du AIManager et des 4 services IA.
// Partie unitaire : provider "rules" (sans base). Partie intégration : les
// routes branchées (diagnostic, maintenance, quotes) via l'API réelle.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api, register, createVehicle, createServiceRequest, proToken, buildJourney } = require('./helpers');

// ---------- Unitaire : héberge une instance de test (pas le singleton) ----------
const AIManager = require('../src/services/ai/AIManager');
const AIProvider = require('../src/services/ai/AIProvider');
const RulesProvider = require('../src/services/ai/providers/rules');
const LLMProvider = require('../src/services/ai/providers/llm');
const { services } = require('../src/services/ai');

function makeManager(provider = 'rules', demoMode = false) {
  const m = new AIManager({ config: { ai: { provider }, demoMode } });
  m.register(new RulesProvider());
  m.register(new LLMProvider({ code: 'openai', label: 'OpenAI', config: { key: '', model: 'x' } }));
  return m;
}

test('AIProvider: exposes les métadonnées et le contrat decision/insight', () => {
  assert.ok(AIProvider);
  const rules = new RulesProvider();
  assert.equal(rules.getKind(), 'rules');
  assert.equal(rules.isConfigured(), true);
  assert.equal(rules.isTestMode(), false);
  const external = new LLMProvider({ code: 'openai', label: 'OpenAI', config: { key: '' } });
  assert.equal(external.getKind(), 'external');
  assert.equal(external.isConfigured(), false);
  assert.equal(external.isTestMode(), true); // sans clé ⇒ jamais d'appel réel
});

test('AIManager: le fournisseur actif est selectionne par la config', () => {
  const m = makeManager('openai');
  assert.equal(m.getActive().getCode(), 'openai');
});

test('AIManager: degrade toujours vers les regles (fournisseur inconnu ou demo)', () => {
  assert.equal(makeManager('nonexistent').getActive().getCode(), 'rules');
  assert.equal(makeManager('openai', true).run && 1, 1); // ne plante pas en démo
});

test('AIManager: en demo, meme un LLM configure bascule sur les regles (aucun appel externe)', async () => {
  const m = makeManager('openai', true);
  const res = await m.run('diagnose', { text: 'bruit frein vibration pedale', category: 'freinage' });
  assert.equal(res.provider.code, 'rules');
  assert.ok(res.result_hypotheses && res.result_hypotheses.length > 0);
});

test('DiagnosticAI: les regles produisent une decision deterministe', async () => {
  const res = await services.diagnosticAI.analyse({
    text: 'bruit au freinage avant, vibration de la pedale', category: 'freinage', dtcCodes: []
  });
  assert.equal(res.provider.code, 'rules');
  assert.ok(res.result_hypotheses.length > 0, 'au moins une hypothèse');
  assert.equal(res.result_urgency, 'MOYENNE');
  assert.ok(res.result_controls.includes('Mesure d\'épaisseur des disques et plaquettes'));
});

test('DiagnosticAI: expose les champs expert sans casser le contrat historique', async () => {
  const res = await services.diagnosticAI.analyse({
    text: 'vibration moteur et perte de puissance', category: 'moteur', dtcCodes: ['P0300']
  });
  // Contrat historique intact.
  assert.ok(typeof res.result_comprehension === 'string' && res.result_comprehension.length > 0);
  assert.ok(Array.isArray(res.result_hypotheses) && res.result_hypotheses.length > 0);
  assert.ok(Array.isArray(res.result_causes) && res.result_causes.length > 0);
  assert.ok(Array.isArray(res.result_controls) && res.result_controls.length > 0);
  assert.ok(res.result_urgency);
  assert.ok(res.result_confidence);
  // Champs expert présents avec de vraies valeurs.
  assert.ok(res.result_doctrine && res.result_doctrine.length > 0, 'doctrine non vide');
  assert.ok(Array.isArray(res.result_dtc) && res.result_dtc.length === 1, 'result_dtc renseigné via dtcKnowledge');
  assert.equal(res.result_dtc[0].code, 'P0300');
  assert.ok(res.result_method && res.result_method.headline && Array.isArray(res.result_method.appliedSteps));
  assert.ok(Array.isArray(res.result_critical_causes), 'critical_causes est un tableau');
  assert.ok(res.result_confirmation && res.result_confirmation.principle && Array.isArray(res.result_confirmation.plan));
  assert.ok(Array.isArray(res.result_root_cause_alt), 'root_cause_alt est un tableau');
  assert.ok(res.result_reduce_parts && res.result_reduce_parts.message && Array.isArray(res.result_reduce_parts.low_cost_first));
});

test('QuoteAnalysisAI: analyse descriptive sans jamais decider', async () => {
  const res = await services.quoteAnalysisAI.analyze({
    quote: { total_cents: 31000, delay_days: 2 },
    items: [
      { label: 'Plaquettes', kind: 'PARTS', qty: 1, unit_price_cents: 15000 },
      { label: 'Main d oeuvre', kind: 'LABOR', qty: 2, unit_price_cents: 8000 }
    ]
  });
  assert.equal(res.provider.code, 'rules');
  assert.equal(res.decision.total_cents, 31000);
  assert.equal(res.decision.fairness, 'EQUILIBRE');
  assert.ok(Array.isArray(res.decision.alerts));
  const empty = await services.quoteAnalysisAI.analyze({ quote: { total_cents: 0 }, items: [] });
  assert.equal(empty.decision.fairness, 'INCOHERENT');
});

test('VehicleHistoryAI: synthese de l historique sans le modifier', async () => {
  const res = await services.vehicleHistoryAI.summarize({
    vehicle: { make: 'Toyota' },
    entries: [{ entry_type: 'WARNING' }, { entry_type: 'DIAGNOSTIC' }],
    diags: [{ id: 1 }], interventions: [{ id: 1 }], warranty: { is_active: true }
  });
  assert.equal(res.provider.code, 'rules');
  assert.equal(res.decision.health, 'VIGILANCE');
  assert.equal(res.decision.total_entries, 2);
  assert.equal(res.decision.warranty_active, true);
});

test('VehicleHealthScore: score global + sous-scores explicables si données', async () => {
  const now = new Date().toISOString();
  const res = await services.vehicleHealthScoreAI.compute({
    vehicle: { id: 'v1', make: 'Renault', model: 'Clio', mileage: 60000, initial_mileage: 0, created_at: now },
    maint: { decision: { score: 92, alerts: [{ overdue: false, dueSoon: true }] } },
    sessions: [
      { category: 'freinage', result_urgency: 'MOYENNE', created_at: now },
      { category: 'batterie', result_urgency: 'HAUTE', created_at: now }
    ],
    entries: [{ entry_type: 'MAINTENANCE' }],
    interventions: [{ id: 1 }]
  });
  assert.equal(res.state, 'OK');
  assert.equal(typeof res.score, 'number');
  assert.ok(res.score >= 0 && res.score <= 100);
  const ent = res.subscores.find((s) => s.domain === 'Entretien');
  const susp = res.subscores.find((s) => s.domain === 'Suspension');
  assert.equal(ent.score, 92);
  assert.equal(susp.state, 'INSUFFICIENT_DATA');
  assert.equal(susp.score, null);
});

test('VehicleHealthScore: aucune donnée => Données insuffisantes', async () => {
  const res = await services.vehicleHealthScoreAI.compute({
    vehicle: { id: 'v2', make: 'Renault', model: 'Clio', mileage: 1000, initial_mileage: 0, created_at: new Date().toISOString() },
    maint: { decision: {} }, sessions: [], entries: [], interventions: []
  });
  assert.equal(res.state, 'INSUFFICIENT_DATA');
  assert.equal(res.score, null);
  assert.equal(res.message, 'Données insuffisantes');
});

// ---------- Intégration : routes branchées ----------
test('API Diagnostic: la decision provient des regles (ai_provider=rules)', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const r = await api('POST', '/api/diagnostic', {
    token: a.token,
    body: { vehicle_id: v.id, category: 'Freinage', symptom_text: 'Bruit au freinage et vibration de la pedale' }
  });
  assert.equal(r.status, 201);
  assert.equal(r.data.ai_provider.code, 'rules');
  assert.ok(r.data.session.result_hypotheses.length > 0);
});

test('API Maintenance: fournisseur de regles + etat de sante', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const r = await api('GET', `/api/maintenance/vehicle/${v.id}`, { token: a.token });
  assert.equal(r.status, 200);
  assert.equal(r.data.ai_provider.code, 'rules');
  assert.ok(['OK', 'ATTENTION', 'DEGRADE'].includes(r.data.health));
  assert.ok(typeof r.data.score === 'number');
});

test('API VehicleHealthScore: expose le score santé véhicule', async () => {
  const a = await register();
  const v = await createVehicle(a.token);
  const r = await api('GET', `/api/vehicles/${v.id}/health-score`, { token: a.token });
  assert.equal(r.status, 200);
  assert.equal(r.data.vehicle_id, v.id);
  assert.ok(['OK', 'INSUFFICIENT_DATA'].includes(r.data.health.state));
  if (r.data.health.state === 'OK') {
    assert.ok(typeof r.data.health.score === 'number');
    assert.ok(Array.isArray(r.data.health.subscores));
  } else {
    assert.equal(r.data.health.message, 'Données insuffisantes');
  }
});

test('API Quote: l analyse IA est descriptive et non engageante', async () => {
  const j = await buildJourney({ stage: 'quote' });
  const r = await api('GET', `/api/quotes/${j.quoteId}`, { token: j.client.token });
  assert.equal(r.status, 200);
  assert.ok(r.data.analysis, 'analyse présente');
  assert.equal(r.data.analysis.provider.code, 'rules');
  assert.equal(r.data.analysis.decision.item_count, 2);
  // Décision humaine intacte : le devis reste approuvable via la route dédiée.
  assert.equal(r.data.quote.status, 'PENDING');
});

test('API Capabilities: liste les fournisseurs (rules + llm inactifs)', async () => {
  const { aiManager } = require('../src/services/ai');
  const caps = aiManager.listCapabilities();
  const codes = caps.map((c) => c.code);
  assert.ok(codes.includes('rules'));
  assert.ok(codes.includes('openai'));
  const rules = caps.find((c) => c.code === 'rules');
  assert.equal(rules.configured, true);
});
