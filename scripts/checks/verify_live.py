import urllib.request
c = urllib.request.urlopen('https://cauto.onrender.com/app/app-v8.js', timeout=90).read().decode()
print('window.showLoading live:', 'window.showLoading = showLoading' in c)
print('EXPOSITION GLOBALE live:', 'EXPOSITION GLOBALE' in c)
