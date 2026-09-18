import subprocess
result = subprocess.run(['git', 'diff', 'frontend/www/app/app-v8.js'], capture_output=True, text=True, cwd=r'C:\Users\utilisateur\Documents\Default Project')
print(result.stdout[:500])
print('---')
print(result.stderr[:200])
