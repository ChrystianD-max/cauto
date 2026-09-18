import subprocess
cwd = r"C:\Users\utilisateur\Documents\Default Project"
def g(*a, **k):
    r = subprocess.run(['git']+list(a), capture_output=True, text=True, cwd=cwd, **k)
    return r.stdout, r.stderr
o,e = g('add', 'frontend/www/app/app-v8.js')
o,e = g('commit', '-m', 'fix: expose helpers (api, toast, showLoading, esc...) sur window pour les scripts classiques views-*.js (module scope)')
print(o, e)
o,e = g('push', 'origin', 'HEAD:main')
print(o, e)
