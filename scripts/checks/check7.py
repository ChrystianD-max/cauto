import urllib.request
r = urllib.request.urlopen('https://cauto.onrender.com/app/views-admin.js')
c = r.read().decode()
lines = c.split('\n')
for i, l in enumerate(lines):
    if 'window.S' in l or 'S.' in l:
        print(f'{i+1}: {l.strip()[:150]}')
