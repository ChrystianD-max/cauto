import urllib.request
r = urllib.request.urlopen('https://cauto.onrender.com/app/index.html')
c = r.read().decode()
# Find the app-v8.js script tag
for l in c.split('\n'):
    if 'app-v8.js' in l:
        print(l.strip())
# Check for window.onerror
r2 = urllib.request.urlopen('https://cauto.onrender.com/app/app-v8.js')
c2 = r2.read().decode()
print('window.onerror present:', 'window.onerror' in c2)
print('window.S present:', 'window.S = S' in c2)
print('window.setSession present:', 'window.setSession = setSession' in c2)
