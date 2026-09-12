$ErrorActionPreference='Stop'
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$utf8=New-Object System.Text.UTF8Encoding($false)

$imgTag='<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:28px;height:28px;border-radius:22%;vertical-align:middle"> '
"logo-app.png existe : "+(Test-Path -LiteralPath (Join-Path $www 'app\icons\logo-app.png'))

# --- 1) tous les HTML : remplacer le dessin SVG inline du car C-AUTO dans les nav-logo / nav-logo-footer / sidebar-brand ---
$n=0
Get-ChildItem -Path (Join-Path $www 'app') -Filter *.html -File -Recurse | ForEach-Object {
  $null=$_ # (pas de recursif bas niveau ici)
}
Get-ChildItem -Path (Join-Path $www 'app') -Filter *.html -File -Recurse | ForEach-Object {
  $p=$_.FullName
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # a) le SVG complet dessinant le car dans un <a ... nav-logo> :  <a ...><svg viewBox="0 0 100 100">...</svg> <span...>
  $t=[regex]::Replace($t,'(<a\b[^>]*\bclass="[^"]*nav-logo[^"]*"[^>]*>)\s*<svg\b[^>]*viewBox="[^"]*"[^>]*>.*?</svg>\s*','$1'+$imgTag,[Text.RegularExpressions.RegexOptions]::Singleline)
  if($t -ne $o){ [IO.File]::WriteAllText($p,$t,$utf8); $n++; '  app\ '+$_.Name }
}
"app\*.html : $n fichier(s) modifie(s)"

# --- 2) meme chose pour les pages racine (contact, pieces, etc) ---
$n2=0
Get-ChildItem -Path $www -Filter *.html -File | Where-Object { $_.Name -ne 'index.html' } | ForEach-Object {
  $p=$_.FullName
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  $t=[regex]::Replace($t,'(<a\b[^>]*\bclass="[^"]*nav-logo[^"]*"[^>]*>)\s*<svg\b[^>]*viewBox="[^"]*"[^>]*>.*?</svg>\s*','$1'+$imgTag,[Text.RegularExpressions.RegexOptions]::Singleline)
  if($t -ne $o){ [IO.File]::WriteAllText($p,$t,$utf8); $n2++; '  '+$_.Name }
}
"racine *.html : $n2 fichier(s) modifie(s)"
