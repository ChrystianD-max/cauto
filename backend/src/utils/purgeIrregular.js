const fs = require('fs');

const P = __dirname + '/..' + '/src/routes/repairs.js';
let s = fs.readFileSync(P, 'utf8');

const IRREGULAR = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/gUp;

function fixLine(line) {
  return line.replace(IRREGULAR, ' ');
}

const lines = s.split(/\r?\n/);
const targets = [247, 252, 280, 284];
let fixed = 0;
for (const n of targets) {
  const i = n - 1;
  if (i < 0 || i >= lines.length) continue;
  const before = lines[i];
  const after = fixLine(before);
  if (after !== before) { lines[i] = after; fixed++; }
}

fs.writeFileSync(P, lines.join('\r\n'), 'utf8');
console.log('lignes_nbsp_purgees=' + fixed);
