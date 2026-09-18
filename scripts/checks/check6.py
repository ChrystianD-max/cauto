import urllib.request
r = urllib.request.urlopen('https://cauto.onrender.com/app/')
c = r.read().decode()
print('Has app-v8:', 'app-v8.js' in c)
print('Has TEST-LOADING:', 'TEST-LOADING' in c)
print('Has type=module:', 'type="module"' in c)
print('Length:', len(c))
