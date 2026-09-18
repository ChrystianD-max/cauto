import urllib.request

CHECK = {
    "app-v8.js": ["EXPOSITION GLOBALE", "window.showLoading = showLoading"],
    "views-admin.js": ["function viewAdminDashboard", "console.log"],
}

for name, needles in CHECK.items():
    url = "https://cauto.onrender.com/app/" + name
    try:
        c = urllib.request.urlopen(url, timeout=90).read().decode()
        print("=== %s ===" % name)
        for n in needles:
            print("   %-40s %s" % (n, ("OK" if n in c else "ABSENT")))
    except Exception as e:
        print("=== %s === ERREUR %s" % (name, type(e).__name__))
