import os, re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

root = 'backend'
appjs = None
for dp, dn, fn in os.walk(root):
    if 'node_modules' in dp:
        continue
    for f in fn:
        if not f.endswith('.js'):
            continue
        p = os.path.join(dp, f)
        try:
            c = open(p, encoding='utf-8').read()
        except Exception:
            continue
        isApp = 'app.js' in f or 'index.js' in f or 'server.js' in f
        routes = []
        for m in re.finditer(r'(?m)^\s*(?:router|app)\.(get|post|put|patch|delete)\(', c):
            # recuperer le premier argument (chemin) jusqu'a la virgule
            seg = c[m.end():m.end()+120]
            mm = re.match(r"\s*['\"]([^'\"]+)['\"]", seg)
            if mm:
                routes.append((m.group(1).upper(), mm.group(1)))
        tag = ' *APP*' if isApp else ''
        if routes:
            print(f'### {p}{tag}')
            for v, path in routes:
                print(f'   {v:6s} {path}')
print()
print('=== recherche routes admin ===')
for dp, dn, fn in os.walk(root):
    if 'node_modules' in dp:
        continue
    for f in fn:
        if not f.endswith('.js'):
            continue
        p = os.path.join(dp, f)
        c = open(p, encoding='utf-8').read()
        if 'admin' in c.lower() and ('router' in c or "app." in c):
            print('  POTENTIEL:', p, '(' + str(c.lower().count('admin')) + 'x "admin")')
