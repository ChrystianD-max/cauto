import urllib.request
r = urllib.request.urlopen('https://cauto.onrender.com/app/app-v8.js')
c = r.read().decode()
lines = c.split('\n')
for i,l in enumerate(lines):
    if 'const S' in l or 'window.S' in l:
        print(f'{i+1}: {l.strip()[:150]}')
