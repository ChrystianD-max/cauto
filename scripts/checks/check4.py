import urllib.request
r = urllib.request.urlopen('https://cauto.onrender.com/')
c = r.read().decode()
print('Has TEST-LOADING:', 'TEST-LOADING' in c)
print('Has app-v8:', 'app-v8.js' in c)
print('type=module:', 'type="module"' in c)
print('Has body:', '<body>' in c)
print('First body line:', [l for l in c.split('\n') if '<body>' in l][:1])
