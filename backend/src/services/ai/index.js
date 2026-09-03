// Module 70 — ARCHITECTURE IA.
// Assemble le manager de fournisseurs IA, enregistre les fournisseurs
// disponibles et expose les 4 services métier (singletons).
const config = require('../../config');
const { logger } = require('../../observability');
const AIManager = require('./AIManager');
const RulesProvider = require('./providers/rules');
const LLMProvider = require('./providers/llm');

const aiManager = new AIManager({ config, logger });

// Fournisseur décisionnel de référence (TOUJOURS enregistré en premier).
aiManager.register(new RulesProvider());

// Fournisseurs externes facultatifs. Sans clé API, isConfigured()=false et
// l'application reste sur les règles (aucun appel externe, même en prod).
aiManager.register(new LLMProvider({
  code: 'openai',
  label: 'OpenAI (LLM externe)',
  config: { ...config.ai.openai, code: 'openai' }
}));
aiManager.register(new LLMProvider({
  code: 'anthropic',
  label: 'Anthropic Claude (LLM externe)',
  config: { ...config.ai.anthropic, code: 'anthropic' }
}));

if (config.ai.enabled) {
  const active = aiManager.getActive();
  if (logger && logger.info) {
    logger.info({ msg: 'ai_provider_active', provider: active.getCode(), kind: active.getKind(), testMode: active.isTestMode() });
  }
}

const DiagnosticAI = require('./services/DiagnosticAI');
const MaintenanceAI = require('./services/MaintenanceAI');
const QuoteAnalysisAI = require('./services/QuoteAnalysisAI');
const VehicleHistoryAI = require('./services/VehicleHistoryAI');
const VehicleHealthScoreAI = require('./services/VehicleHealthScoreAI');

const diagnosticAI = new DiagnosticAI(aiManager);
const maintenanceAI = new MaintenanceAI(aiManager);
const quoteAnalysisAI = new QuoteAnalysisAI(aiManager);
const vehicleHistoryAI = new VehicleHistoryAI(aiManager);
const vehicleHealthScoreAI = new VehicleHealthScoreAI(aiManager);

module.exports = {
  aiManager,
  AIManager,
  AIProvider: require('./AIProvider'),
  services: { diagnosticAI, maintenanceAI, quoteAnalysisAI, vehicleHistoryAI, vehicleHealthScoreAI },
  capabilities: () => aiManager.listCapabilities()
};
