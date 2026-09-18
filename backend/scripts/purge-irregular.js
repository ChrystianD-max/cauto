const fs = require('fs');

const IRREGL = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g;

const targets = [
  'src/routes/repairs.js',
  'src/routes/disputes.js',
  'src/routes/quotes.js'
];

for (const rel of targets) {
  const p = require('path').join(__dirname, '..', rel);
  const s = fs.readFileSync(p, 'utf8');
  let n = 0;
  const out = s.replace(IRREGL, () => { n++; return ' '; });
  fs.writeFileSync(p, out);
  console.log('PURGE ' + rel + ' : sequences_irregulieres_remplacees=' + n);
}
console.log('OK');
