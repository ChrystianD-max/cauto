import subprocess, urllib.request
# Check local file
with open('frontend/www/app/app-v8.js', 'r', encoding='utf-8') as f:
    local = f.read()
print('Local DEBUG:', 'DEBUG' in local)
print('Local isAdmin:', 'const isAdmin' in local)
print('Local window.setSession:', 'window.setSession = setSession' in local)

# Check remote
r = urllib.request.urlopen('https://cauto.onrender.com/app/app-v8.js')
remote = r.read().decode()
print('Remote DEBUG:', 'DEBUG' in remote)
print('Remote isAdmin:', 'const isAdmin' in remote)
print('Remote window.setSession:', 'window.setSession = setSession' in remote)
