import urllib.request
r = urllib.request.urlopen('https://cauto.onrender.com/app/index.html')
c = r.read().decode()
print('type=module:', 'type="module"' in c)
print('app-v8.js:', 'app-v8.js' in c)
