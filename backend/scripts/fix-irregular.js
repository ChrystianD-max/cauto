const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'routes', 'repairs.js');
let content = fs.readFileSync(file, 'utf8');

const accents = {
    '\u00E9':'e','\u00E8':'e','\u00EA':'e','\u00EB':'e','\u00E0':'a','\u00E2':'a',
    '\u00E4':'a','\u00EE':'i','\u00EF':'i','\u00F4':'o','\u00F6':'o','\u00F9':'u',
    '\u00FB':'u','\u00FC':'u','\u00E7':'c','\u00C9':'E','\u00C8':'E','\u00CA':'E',
    '\u00C0':'A','\u00C2':'A','\u00C4':'A','\u00CE':'I',''\u00CF':'I','\u00D4':'O',
    '\u00D6':'O','\u00D9':'U','\u00DB':'U','\u00DC':'U','\u00C7':'C'
};
// Correction des 4 lignes detectees par eslint (247,252,280,284) -> ASCII pur
const lines = content.split(/\r?\n/);
let fixed = 0;
for (const idx of [247, 252, 280, 284]) {
    if (idx < 1 || idx > lines.length) continue;
    let line = lines[idx - 1];
    let before = line;
    line = line
        .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, ' ')
        .replace(/[^\x00-\x7F]/g, (ch) => accents[ch] != null ? accents[ch] : ch);
    if (line !== before) { lines[idx - 1] = line; fixed++; }
}
content = lines.join('\r\n');
fs.writeFileSync(file, content, 'utf8');
console.log('Lignes corrigees = ' + fixed);
