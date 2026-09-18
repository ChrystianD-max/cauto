import urllib.request,re
r = urllib.request.urlopen('https://cauto.onrender.com/app/views-admin.js')
c = r.read().decode()
lines = c.split('\n')
for i,l in enumerate(lines):
    if 'window.S' in l or re.search(r'(?<!window\.)(?<!S\.)\bS\b(?!\.)', l):
        print(f'{i+1}: {l.strip()[:200]}')
