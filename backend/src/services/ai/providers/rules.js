// Module 70 — ARCHITECTURE IA : fournisseur de RÈGLES (déterministe).
//
// Fournisseur DECISIONNEL PAR DÉFAUT. Il encapsule les moteurs de règles
// existants (diagnosticService, maintenanceEngine) et fournit les capacités
// de QUOTE et de HISTORY par des règles locales. Aucune donnée externe, aucun
// appel réseau : déterministe, testable, hors-ligne — conforme au MODE DÉMO.
const AIProvider = require('../AIProvider');
const diag = require('../../../utils/diagnosticService');
const maintenanceEngine = require('../../../utils/maintenanceEngine');

class RulesProvider extends AIProvider {
  constructor() {
    super({ code: 'rules', label: 'Règles métier C-AUTO (déterministe)', kind: 'rules' });
  }

  // Toujours "configuré" : les règles locales sont toujours disponibles.
  isConfigured() { return true; }

  // ---- DiagnosticAI ----
  async diagnose({ text, category, dtcCodes = [], vehicleHistory = [] }) {
    const computed = diag.CATEGORIES[category || 'autre'] ? category : diag.extractCategory(text || '');
    return diag.analyseSymptoms(text || '', computed, dtcCodes || [], vehicleHistory || []);
  }

  // ---- MaintenanceAI ----
  async maintenance({ vehicle }) {
    const overview = await maintenanceEngine.overview(vehicle);
    const next = overview.all.filter((i) => i.status !== 'OK')
      .sort((a, b) => a.km_left - b.km_left)[0] || null;
    return {
      decision: {
        score: overview.score,
        alerts: overview.alerts,
        next_due: next,
        overall_status: overview.alerts.some((a) => a.overdue)
          ? 'DEGRADE'
          : overview.alerts.length ? 'ATTENTION' : 'OK'
      },
      program_constructor: overview.program_constructor,
      recommendations_cauto: overview.recommendations_cauto,
      all: overview.all
    };
  }

  // ---- QuoteAnalysisAI ----
  async analyzeQuote({ quote = {}, items = [] }) {
    const total = Number(quote.total_cents) || items.reduce((s, it) => s + (it.qty || 1) * (it.unit_price_cents || 0), 0);
    const parts = (items || []).filter((i) => (i.kind || 'OTHER') === 'PARTS');
    const labor = (items || []).filter((i) => (i.kind || 'OTHER') === 'LABOR');
    const partCents = parts.reduce((s, it) => s + (it.qty || 1) * (it.unit_price_cents || 0), 0);
    const laborCents = labor.reduce((s, it) => s + (it.qty || 1) * (it.unit_price_cents || 0), 0);

    const alerts = [];
    if (items.length === 0) alerts.push({ level: 'WARN', code: 'NO_ITEMS', message: 'Le devis ne contient aucune ligne' });
    if (total <= 0) alerts.push({ level: 'ERROR', code: 'ZERO_TOTAL', message: 'Total du devis nul ou négatif' });
    if (this._duplicates(items)) alerts.push({ level: 'WARN', code: 'DUP_LINES', message: 'Des lignes semblent en double' });
    if (labor.length && !Number(quote.delay_days)) alerts.push({ level: 'INFO', code: 'NO_DELAY', message: 'Main-d’œuvre sans délai annoncé' });

    // Décision : la "fairness" reste une aide descriptive fondée sur des seuils
    // de règles simples — jamais une approbation/rejet automatique du devis.
    let fairness = 'A_VERIFIER';
    if (total <= 0) fairness = 'INCOHERENT';
    else if (parts.length && !labor.length) fairness = 'REVISION';
    else fairness = 'EQUILIBRE';

    return {
      decision: {
        total_cents: total,
        part_cents: partCents,
        labor_cents: laborCents,
        item_count: items.length,
        part_ratio: total > 0 ? Math.round((partCents / total) * 100) : 0,
        labor_ratio: total > 0 ? Math.round((laborCents / total) * 100) : 0,
        alerts,
        fairness
      }
    };
  }

  // ---- VehicleHistoryAI ----
  async vehicleHistory({ entries = [], diags = [], interventions = [], warranty = null }) {
    const counts = {};
    for (const e of entries || []) {
      const t = e.entry_type || 'OTHER';
      counts[t] = (counts[t] || 0) + 1;
    }
    const annotations = (entries || []).filter((e) => e.entry_type === 'ANNOTATION').length;
    const warnings = (entries || []).filter((e) => e.entry_type === 'WARNING').length;
    const last = (arr) => (arr && arr[0] ? arr[0].created_at : null);

    const health = warnings > 0 ? 'VIGILANCE' : (interventions && interventions.length) ? 'ENTRETIEN' : 'STABLE';
    return {
      decision: {
        summary: `${annotations} annotation(s), ${warnings} avertissement(s), ${(interventions || []).length} intervention(s).`,
        total_entries: (entries || []).length,
        interventions_count: (interventions || []).length,
        diagnostics_count: (diags || []).length,
        warranty_active: Boolean(warranty && warranty.is_active),
        last_event_at: last(entries),
        health
      },
      detail: { by_type: counts }
    };
  }

  _duplicates(items) {
    if (!items || items.length < 2) return false;
    const seen = new Set();
    for (const it of items) {
      const k = `${it.kind || 'OTHER'}|${String(it.label || '').toLowerCase()}|${it.qty}|${it.unit_price_cents}`;
      if (seen.has(k)) return true;
      seen.add(k);
    }
    return false;
  }
}

module.exports = RulesProvider;
