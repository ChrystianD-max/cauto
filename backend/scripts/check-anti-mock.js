'use strict';

/* =============================================================================
   C-AUTO — Règle anti-mock (module 67) : vérificateur d'anti-patterns
   -----------------------------------------------------------------------------
   But : interdire "un tableau JavaScript statique comme remplacement permanent
   de la base de données". Un stock en mémoire (const/let <nomTable> = [...] ou
   = new Map()) déclaré au niveau MODULE et nommé comme une TABLE MÉTIER du
   schéma réel est un anti-pattern → CI échoue.

   Règle anti-mock complète (voir ANTI_MOCK_RULES.md) : les mocks ne sont
   autorisés que dans les tests, dans DEMO_MODE, ou quand une intégration
   externe n'est pas configurée. Ce script ne vérifie QUE l'anti-pattern
   structurel "fausse base de données en mémoire" (objectivable, sans faux
   positifs).

   Exclusions volontaires :
     - accumulateurs LOCAUX (déclarés à l'intérieur d'une fonction) ;
     - constantes d'énumération en MAJUSCULES (ROLES, ORDER_STATUS, …) ;
     - mappings statiques de domaine / config (i18n-dict, COUNTRY, MIME…) ;
     - fichiers de test (*.test.js) — le mock y est autorisé par la règle.
   =========================================================================== */

const fs = require('fs');
const path = require('path');

const TABLES = {
  users: ['users'],
  roles: ['roles'],
  vehicles: ['vehicles'],
  serviceRequests: ['service_requests'],
  interventions: ['interventions'],
  quotes: ['quotes'],
  quoteItems: ['quote_items'],
  repairOrders: ['repair_orders'],
  payments: ['payments'],
  garages: ['garages'],
  professionals: ['professionals'],
  appointments: ['appointments'],
  messages: ['messages'],
  notifications: ['notifications'],
  parts: ['parts'],
  suppliers: ['suppliers'],
  invoices: ['invoices'],
  warranties: ['warranties'],
  diagnostics: ['diagnostics'],
  disputes: ['disputes'],
  ratings: ['ratings'],
  vehiclesHistory: ['vehicle_history'],
  userProfiles: ['user_profiles'],
  conversations: ['conversations'],
  conversationMembers: ['conversation_members'],
  orderItems: ['order_items'],
  partOrders: ['part_orders'],
  maintenanceRecords: ['maintenance_records'],
  maintenanceRules: ['maintenance_rules'],
  matchingProfiles: ['matching_profiles'],
  professionalMatches: ['professional_matches'],
  inventories: ['inventory'],
  transactions: ['transactions'],
  auditLogs: ['audit_logs'],
  otpCodes: ['otp_codes'],
  refreshTokens: ['refresh_tokens'],
  fleetAccounts: ['fleet_accounts'],
  fleetVehicles: ['fleet_vehicles'],
  gpsTracking: ['gps_tracking'],
};

const SRC = path.join(__dirname, '..', 'src');
const IGNORED_DIRS = new Set(['node_modules']);
const IGNORED_FILES_ENDING = ['.test.js', '.spec.js'];

const TOP_LEVEL_DECL =
  /^(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\[|new\s+Map\(|new\s+Set\()/;
// Déclaration LOCALE (indentée dans une fonction) — non bloquante mais on note
// pour information s'il s'agit d'un nom de table (accumulateur temporaire).
const LOCAL_DECL = /^(?=\s{2,})(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[/;

function collect(errors, warnings, file, lines) {
  lines.forEach((line, idx) => {
    const n = idx + 1;
    if (line.startsWith('//') || line.startsWith('/*')) return;
    // Top-level : anti-pattern "fausse base de données en mémoire"
    const top = TOP_LEVEL_DECL.exec(line);
    if (top) {
      const [, , name] = top;
      if (name === name.toUpperCase()) return; // constante d'énum → légitime
      const norm = name.toLowerCase();
      const matches = TABLES[norm];
      if (matches) {
        errors.push(
          `ANTI-MOCK (module 67) ${rel(file)}:${n} — « ${name} » est déclaré en ` +
          `mémoire au niveau module et porte un nom de table métier (${matches.join(', ')}). ` +
          `Un tableau/Map statique ne peut PAS remplacer la base. Déclaré : ${line.trim()}`,
        );
      }
    }
    // Local : accumulateur temporaire nommé comme une table — information
    const loc = LOCAL_DECL.exec(line);
    if (loc && TABLES[loc[1].toLowerCase()]) {
      warnings.push(`${rel(file)}:${n} — accumulateur local « ${loc[1]} » (vérifier qu'il s'agit bien d'un résultat de calcul, pas d'un cache persistant)`);
    }
  });
}

function rel(file) {
  return file.replace(path.join(__dirname, '..'), '.');
}

function walk(dir, errors, warnings) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), errors, warnings);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      if (IGNORED_FILES_ENDING.some((s) => entry.name.endsWith(s))) continue;
      const file = path.join(dir, entry.name);
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      collect(errors, warnings, file, lines);
    }
  }
}

const errors = [];
const warnings = [];
walk(SRC, errors, warnings);

if (warnings.length) {
  console.log(`\n[anti-mock] ${warnings.length} avertissement(s) d'accumulateurs locaux (non bloquant) :`);
  warnings.forEach((w) => console.log('  - ' + w));
}

if (errors.length) {
  console.error(`\n[anti-mock] VIOLATION — ${errors.length} faux stock(s) de données en mémoire détecté(s) :`);
  errors.forEach((e) => console.error('  ✗ ' + e));
  console.error('\n[anti-mock] Résultat : ÉCHEC (fausse base de données en mémoire interdite par le module 67).');
  process.exit(1);
}

console.log(`[anti-mock] OK — aucun tableau/Map statique ne remplace la base de données dans src/ (${errors.length} violation, ${warnings.length} avertissement).`);
process.exit(0);
