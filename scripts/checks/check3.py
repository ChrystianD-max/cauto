import urllib.request
# Check views-professionals-v8.js for syntax issues
r = urllib.request.urlopen('https://cauto.onrender.com/app/views-professionals-v8.js')
c = r.read().decode()
# Count window.S vs S. patterns
import re
window_s = len(re.findall(r'window\.S\b', c))
standalone_s = len(re.findall(r'(?<!window\.)(?<!S\.)\bS\b(?!\.)', c))
print('window.S count:', window_s)
print('standalone S count:', standalone_s)
# Check views-chat.js
r2 = urllib.request.urlopen('https://cauto.onrender.com/app/views-chat.js')
c2 = r2.read().decode()
ws2 = len(re.findall(r'window\.S\b', c2))
print('views-chat window.S:', ws2)
# Check views-modules-v2.js
r3 = urllib.request.urlopen('https://cauto.onrender.com/app/views-modules-v2.js')
c3 = r3.read().decode()
ws3 = len(re.findall(r'window\.S\b', c3))
print('views-modules-v2 window.S:', ws3)
