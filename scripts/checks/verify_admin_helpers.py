import urllib.request, re

def get(name):
    return urllib.request.urlopen('https://cauto.onrender.com/app/' + name, timeout=90).read().decode()

mod   = get('app-v8.js')
admin = get('views-admin.js')

# ---- helpers exposés sur window par le module ----
exposed = set()
for m in re.finditer(r'window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*;', mod):
    exposed.add(m.group(2))  # le nom de valeur exposé (vaut `window.clé`)

# ---- définitions locales dans views-admin.js ----
admdefs = set(re.findall(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', admin))
admdefs |= set(re.findall(r'(?m)^(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=', admin))

# ---- noms appelés (fonctions) dans views-admin qui ne sont pas locaux et pas exposés ----
kw = {'if','for','while','switch','catch','return','function','await','async','typeof',
      'new','else','of','in','this','null','undefined','console','document','window','Math',
      'JSON','Promise','Object','Array','String','Number','Boolean','Date','RegExp',
      'parseInt','parseFloat','encodeURIComponent','decodeURIComponent','location',
      'localStorage','sessionStorage','navigator','fetch','setTimeout','setInterval',
      'clearTimeout','clearInterval','requestAnimationFrame','alert','confirm','Error','event'}
called = set(re.findall(r'(?<![\w.$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', admin))
missing = sorted(x for x in called if x not in admdefs and x not in exposed and x not in kw)
# littéraux/quasi echaïpe
missing = [x for x in missing if not x.isupper()]  # enlever constantes UPPER_CASE

print('=== Helpers appelés dans views-admin.js, non définis localement ET non exposés ===')
if missing:
    for m in missing:
        print('   MANQUE:', m)
else:
    print('   AUCUN — l’espace admin a tout ce qu’il faut. C')
