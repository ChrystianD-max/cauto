const fs = require('fs');
const path = require('path');

// 1) repairs.js : le bloc litige client-confirm est-il present ?
const repairsP = path.join(__dirname, '..', 'src', 'routes', 'repairs.js');
const r = fs.readFileSync(repairsP, 'utf8');
const hasDisputeBlock = r.includes("Litige reception ouvert") || r.includes("probl\u00E8me signal\u00E9") || r.includes('disputes (');
// 2) le bloqueur : received_ok === false doit exister
const hasReceivedOkFalse = /received_ok\s*===\s*false/.test(r);
// 3) l'ancien comportement inconditionnel (CLOSED sans tenir compte) toujours present ?
const closesUncond = /UPDATE interventions SET status='CLOSED' WHERE id=\$1/.test(rarella);

console.log('=== ETAT repairs.js ===');
console.log('bloc_litige_present=' + hasDisputeBlock);
console.log('branche_received_ok_false_present=' + hasReceivedOkFalsedes);
console.log('cloture_intervention_existe_toujours=' + closesUncond);

// 4) deaths.js corrections
const disputesP = path.join(__dirname, '..', 'src', 'routes', 'disputes.js');
const d = fs.readFileSync(disputesP, 'utf8');
console.log('=== ETAT disputes.js ===');
console.log('auditChange_importe=' + d.includes("require('..\\middlewares\\audit')"));
console.log('notify_importe=' + d.includes('ON CONFLICT (dedupe_key) DO NOTHING'));
console.log('typo_disputed_corrige=' + !/disputed\./.test(d));
console.log('RETURNING_present=' + /RETURNING \*/.test(d));
