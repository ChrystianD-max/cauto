import urllib.request, re

base = 'https://cauto.onrender.com/app/'
mod = urllib.request.urlopen(base + 'app-v8.js').read().decode()

modfuncs = set(re.findall(r'(?m)^(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(', mod))
modconsts = set(re.findall(r'(?m)^(?:const|var|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=[^=]', mod))
moddefs = modfuncs | modconsts

# Names referenced as calls in the classic view scripts
need = ['I', 'api', 'err', 'esc', 'hideLoading', 'layoutApp', 'money',
        'renderIcons', 'showLoading', 'toast', 'severityBadge', 'statusBadge',
        'certBadge', 'badge', 'scoreRing', 'scoreRing', 'apiFetch',
        'errorFromHttp', 'errFromHttp', 'forceLogout', 'logout', 'renderSidebar',
        'setSession', 'initPresenceIfLogged', 'loadingShell', 'fl', 'dp', 'roundDate']

for n in sorted(set(need)):
    defined = n in moddefs
    # is it already exposed on window?
    already = ('window[' + repr(n) + ']' in mod) or ('window.' + n + ' =' in mod)
    print(f'{n:20s} defined_in_module={defined}  already_global={already}')
