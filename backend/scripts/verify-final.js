const fs = require('fs');
const path = require('path');

const check = (label, filePath, patterns) => {
  const s = fs.readFileSync(filePath, 'utf8');
  const missing = [];
  for (const p of patterns) if (!s.includes(p)) missing.push(p);
  if (!missing.length) { console.log('OK  ' + label); }
  else { console.log('KO  ' + label + '  manque: ' + JSON.stringify(missing)); }
};

// repairs.js : bloc litige reception present + branche received_ok===false + pas de cloture inconditionnelle
const repairs = path.join(__dirname, '..', 'src', 'routes', 'repairs.js');
const r = fs.readFileSync(repairs, 'utf8');
check('repairs.js: INSERT INTO disputes', repairs, ["INSERT INTO disputes"]);
check('repairs.js: branche received_ok===false', repairs, ["received_ok === false"]);
check('repairs.js: notification pro litige', repairs, ["repair:" + ":dispute:pro"]);
check('repairs.js: notification admin litige', repairs, ["repair:" + ":dispute:admin"]);
check('repairs.js: RETRUN corrige', repairs, ["RETURNING *"]);

// disputes.js : import auditChange + notify + fix disputed typo + RETURNING
const disputes = path.join(__dirname, '..', 'src', 'routes', 'disputes.js');
const d = fs.readFileSync(disputes, 'utf8');
check('disputes.js: import auditChange', disputes, ["require('../middlewares/audit')"]);
check('disputes.js: function notify locale', disputes, ["async function notify("]);
check('disputes.js: typo disputed corrige', disputes, ["dispute.client_confirmed_at || dispute.pro_confirmed_at"]);
check('disputes.js: RETURNING (pas RETRUN)', disputes, ["RETURNING *"]);
check('disputes.js: schema validate sur routes', disputes, ["validate("]);
check('disputes.js: dedupe notifications', disputes, ["ON CONFLICT (dedupe_key) DO NOTHING"]);

// quotes.js : route reissue
const quotes = path.join(__dirname, '..', 'src', 'routes', 'quotes.js');
const q = fs.readFileSync(quotes, 'utf8');
check('quotes.js: route /:id/reissue', quotes, ["/:id/reissue"]);
check('quotes.js: reissue_count++', quotes, ["reissue_count + 1"]);
check('quotes.js: last_pro_note standard', quotes, ["last_pro_note"]);
check('quotes.js: typo 100apse corrige', quotes, ["/ 100"]);

console.log('--- comptage NBSP/espaces irreguliers (0 attendu apres correction) ---');
for (const [label, p] of [['repairs.js', repairs], ['disputes.js', disputes], ['quotes.js', quotes]]) {
  const s = fs.readFileSync(p, 'utf8');
  let count = 0;
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    if (cp === 0xA0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200B) || cp === 0x202F || cp === 0x205F || cp === 0x3000 || cp === 0xFEFF) count++;
  }
  console.log(spacesCount ' + spacing);
}
