const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'src', 'routes', 'repairs.js');
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);

const ACC = {
  '\u00e9': 'e', '\u00e8': 'e', '\u00ea': 'e', '\u00eb': 'e', '\u00e0': 'a',
  '\u00e2': 'a', '\u00e4': 'a', '\u00ee': 'i', '\u00ef': 'i', '\u00f4': 'o',
  '\u00f6': 'o', '\u00f9': 'u', '\u00fb': 'u', '\u00fc': 'u', '\u00e7': 'c',
  '\u00c9': 'E', '\u00c8': 'E', '\u00ca': 'E', '\u00cb': 'E', '\u00c0': 'A',
  '\u00c2': 'A', '\u00c4': 'A', '\u00ce': 'I', '\u00cf': 'I', '\u00d4': 'O',
  '\u00d6': 'O', '\u00d9': 'U', '\u00db': 'U', '\u00dc': 'U', '\u00c7': 'C',
  '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-',
  '\u2014': '-'
};

function normalize(ch) {
  if (ACC[ch] !== undefined) return ACC[ch];
  const cp = ch.codePointAt(0);
  if (cp === 0xA0 || cp === 0x1680 || (cp >= 0x2000 && cp <= 0x200B) || cp === 0x202F || cp === 0x205F || cp === 0x3000 || cp === 0xFEFF) {
    return ' ';
  }
  return ch;
}

const TARGETS = [247, 252, 280, 284];
let changed = 0;
for (const n of TARGETS) {
  const i = n - 1;
  if (i < 0 || i >= lines.length) continue;
  const orig = lines[i];
  let out = '';
  for (const ch of orig) {
    const r = (ch.length === 1) ? normalize(ch) : ch;
    out += r === ch ? ch : r;
  }
  if (out !== orig) { lines[i] = out; changed++; }
}

fs.writeFileSync(p, lines.join('\r\n'), 'utf8');
console.log('lignes_norm_ascii_repairs=' + changed);
