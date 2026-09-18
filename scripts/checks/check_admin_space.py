import urllib.request, re, sys

def get(name):
    u = 'https://cauto.onrender.com/app/' + name
    return urllib.request.urlopen(u, timeout=90).read().decode()

mod = get('app-v8.js')
admin = get('views-admin.js')

# --- 1. Ce qui est exposé sur window par le module ---
exposed = set()
for m in re.finditer(r'window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*', mod):
    exposed.add(m.group(1))

# --- 2. Les helpers définis dans le module (fonctions + const) ---
moddefs = set(re.findall(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', mod))
moddefs |= set(re.findall(r'(?m)^(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=', mod))
# imports nommés
for grp in re.findall(r'import\s*\{([^}]*)\}\s*from', mod):
    for nm in re.findall(r'([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:as\s+\w+)?', grp):
        moddefs.add(nm.strip())

# --- 3. helpers définis localement dans views-admin.js ---
admdefs = set(re.findall(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', admin))
admdefs |= set(re.findall(r'(?m)^(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=', admin))
# tokens window.* définis par views-admin lui-même
admdefs |= set(re.findall(r'(?m)window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*', admin))

# --- 4. Noms appelés dans views-admin (fonctions-appel) + window.* lus ---
called = set(re.findall(r'(?<![\w.$.])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', admin))  # approx
winread = set(re.findall(r'window\.([A-Za-z_$][A-Za-z0-9_$]*)\b', admin))

known = moddefs | admdefs | exposed | {'window'}
unknown_calls = sorted(x for x in called if x not in known and x not in
    {'if','for','while','switch','catch','return','function','await','async','typeof','new','else','of','in','typeof'})
unknown_reads = sorted(x for x in winread if x not in known)

print('=== ESPACE ADMIN : références non résolues ===')
print('Called non résolus:', unknown_calls if unknown_calls else 'AUCUN ✅')
print('window.* lus non résolus:', unknown_reads if unknown_reads else 'AUCUN ✅')

print()
print('=== Exposés sur window par le module (%d) ===' % len(exposed))
print(', '.join(sorted(exposed)))
print()
print('=== window.* utilisés par views-admin ===')
print(', '.join(sorted(winread)))
