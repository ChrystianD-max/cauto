import urllib.request
r = urllib.request.urlopen('https://cauto.onrender.com/index.html')
c = r.read().decode()
print('Has TEST-LOADING:', 'TEST-LOADING' in c)
print('Has type=module:', 'type="module"' in c)
for l in c.split('\n'):
    if 'app-v8' in l:
        print(l.strip())
