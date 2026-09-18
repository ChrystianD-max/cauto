import urllib.request
try:
    r = urllib.request.urlopen('https://cauto.onrender.com/app/index.html')
    c = r.read().decode()
    print('type="module":', 'type="module"' in c)
    print('TEST-LOADING:', 'TEST-LOADING' in c)
    for l in c.split('\n'):
        if 'app-v8.js' in l:
            print(l.strip())
except Exception as e:
    print('Error:', e)
