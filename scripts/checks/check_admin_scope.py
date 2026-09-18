import urllib.request, re

BASE = 'https://cauto.onrender.com/app/'

def get(name):
    return urllib.request.urlopen(BASE + name, timeout=90).read().decode()

mod    = get('app-v8.js')
admin  = get('views-admin.js')

# ---- 1. window.* exposés par le module ----
exposed = set()
for m in re.finditer(r'window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*;', mod):
    exposed.add((m.group(1), m.group(2)))       # (clé exposée, valeur)
exposed_keys = {k for k, _ in exposed}

# ---- 2. définitions LOCALES de views-admin.js (fonctions + const/let) ----
admdefs = set(re.findall(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', admin))
admdefs |= set(re.findall(r'(?m)^(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=', admin))

# ---- 3. helpers du module auxquels views-admin FAIT référence ----
# (noms appelés avec ( ) + noms lus via window.X, qui doivent être exposés)
called = set(re.findall(r'(?<![\w.$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', admin))
winread = set(re.findall(r'(?:window\.|window\[["\'])([A-Za-z_$][A-Za-z0-9_$]*)', admin))
# accès S.X (module S expose plein de data) -> lecture de S ok si S exposé
# on exclut le X de S.X car ce sont des propriétés, pas des globals
called = {c for c in called if c not in (
    {'if','for','while','switch','catch','return','function','await','async',
     'typeof','new','else','of','in','this','null','undefined','console',
     'document','window','Math','JSON','Promise','Object','Array','String',
     'Number','Boolean','Date','RegExp','parseInt','parseFloat','encodeURIComponent',
     'decodeURIComponent','location','localStorage','sessionStorage','navigator','fetch'})}
called -= admdefs

# ---- noms du module qui doivent être exposés (valides) mais ne le sont pas ----
missing = []
for c in sorted(called):
    if c not in exposed_keys:
        missing.append(c)

print('=== HELPERS appelés par views-admin, NON exposés par app-v8 =====')
if missing:
    for m in missing:
        print('  MANQUE:', m)
else:
    print('  AUCUN — toutes les fonctions appelées sont exposées. ✅')

# ---- window.X lus qui ne sont pas exposés ----
miss_r = [w for w in sorted(winread) if w not in exposed_keys and w not in admdefs and w not in (
    'S','api','toast','money','I','esc','err','errFromHttp','showLoading','hideLoading',
    'renderIcons','severityBadge','statusBadge','certBadge','logout','viewDashboard',
    'viewAppointments','renderSidebar','renderTabbar','layoutApp')]
print()
print('=== window.* LUS par views-admin non exposés (hors helpers gérée) =====')
if miss_r:
    for m in miss_r:
        print('  MANQUE:', m)
else:
    print('  AUCUN. ✅')
