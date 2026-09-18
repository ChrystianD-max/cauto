import urllib.request,re
r = urllib.request.urlopen('https://cauto.onrender.com/app/views-admin.js')
c = r.read().decode()
bad = re.findall(r'window\.S\S', c)
print('window.S followed by non-.:', bad[:10])
print('Has viewAdminDashboard:', 'function viewAdminDashboard' in c)
print('Has syntax errors:', c.count('{') == c.count('}'))
print('Has ( :', c.count('('), 'has ) :', c.count(')'))
