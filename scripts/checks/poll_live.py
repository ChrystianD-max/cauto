import urllib.request, time, sys

MARK = 'EXPOSITION GLOBALE'
for i in range(8):
    time.sleep(30)
    try:
        c = urllib.request.urlopen('https://cauto.onrender.com/app/app-v8.js', timeout=60).read().decode()
        print('poll', i, 'live_has_exposition_block:', MARK in c)
        if MARK in c:
            print('  + window.showLoading:', 'window.showLoading = showLoading' in c)
            print('  DEPLOY OK')
            break
    except Exception as e:
        print('poll', i, 'error', type(e).__name__)
