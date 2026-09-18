import urllib.request, re, subprocess, sys, tempfile, os

base = 'https://cauto.onrender.com/'
html = urllib.request.urlopen(base + 'app/index.html').read().decode()
# find relative script srcs
srcs = re.findall(r'<script[^>]*src="([^"]+)"[^>]*>', html)
# also index at root? maybe serving frontend at /
# swappkgs
urls = set()
for s in srcs:
    if s.startswith('http'):
        urls.add(s)
    elif s.startswith('/'):
        urls.add('https://cauto.onrender.com' + s)
    else:
        urls.add('https://cauto.onrender.com/app/' + s)

# Also common candidate files
for name in ['app-v8.js','views-admin.js','views-chat.js','views-modules-v2.js','views-professionals-v8.js','push-manager.js','views-data.js','views-fleet.js','views-supplier.js','views-errors.js','sw.js']:
    urls.add('https://cauto.onrender.com/app/' + name)

has_node = False
try:
    subprocess.run(['node','--version'], capture_output=True)
    has_node = True
except Exception:
    pass

tmp = tempfile.gettempdir()
for u in sorted(urls):
    if not u.endswith('.js'):
        continue
    try:
        code = urllib.request.urlopen(u).read().decode('utf-8')
    except Exception as e:
        print('FETCH FAIL', u, e)
        continue
    if has_node:
        p = os.path.join(tmp, 'chk.js')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(code)
        r = subprocess.run(['node','--check',p], capture_output=True, text=True)
        status = 'OK' if r.returncode==0 else 'SYNTAX ERROR'
        print(status, u)
        if r.returncode!=0:
            print('   ', r.stderr.strip().splitlines()[-1] if r.stderr.strip() else '')
    else:
        print('OK (no node)', u)
