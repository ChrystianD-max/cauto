import re, io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

base = 'backend'
# head du seed.js : convention d'init de la base / pool
p_seed = os.path.join(base,'seed','seed.js')
c = open(p_seed, encoding='utf-8').read()
print('===== seed.js : lignes en rapport DB / pg / pool / DATABASE_URL / logger =====')
for i, line in enumerate(c.splitlines()[:120], 1):
    if re.search(r'pg|Pool|DATABASE_URL|dbconn|require\(', line, re.I):
        print(f'{i:4d} {line[:200]}')

print()
print('===== package.json (backend) : scripts et deps =====')
pj = os.path.join(base,'package.json')
if os.path.exists(pj):
    cpj = open(pj, encoding='utf-8').read()
    m = re.search(r'"scripts"\s*:\s*\{([^}]*)\}', cpj)
    if m:
        print('SCRIPTS>', m.group(1).strip())
    m2 = re.search(r'"dependencies"\s*:\s*\{([^}]*)\}', cpj)
    if m2:
        print('DEPS>', m2.group(1).strip())

print()
print('===== existe-t-il un dossier scripts/ ? =====')
for dp, dn, fn in os.walk(base):
    if 'node_modules' in dp or '.git' in dp:
        continue
    rel = os.path.relpath(dp, base)
    if rel.lower().startswith(('scripts','script')):
        print('DIR:', rel, fn)
