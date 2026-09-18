import urllib.request,re
r = urllib.request.urlopen('https://cauto.onrender.com/app/app-v8.js')
c = r.read().decode()
lines = c.split('\n')
for i,l in enumerate(lines):
    if 'ADMIN_NAV' in l and ('=' in l or 'const' in l):
        print(f'{i+1}: {l.strip()[:200]}')
