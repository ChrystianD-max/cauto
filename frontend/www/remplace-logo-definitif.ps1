$ErrorActionPreference='Stop'
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'

# 1) copie du PNG fourni en logo-ui (app/icons/logo-ui.png)
$ut='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\icons\logo-ui.png'
$utf8=New-Object System.Text.UTF8Encoding($false)
$imgTag='<img src="app/icons/logo-ui.png" alt="C-AUTO" style="width:28px;height:28px;border-radius:22%;vertical-align:middle" />'

# source : le PNG OneDrive
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $hit=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($hit){ $src=$hit.FullName } else { throw 'PNG introuvable' }
}
Copy-Item -LiteralPath $src -Destination $ut -Force
"LOGO UI copie : $ut"

# 2) index.html : remplace le contenu du symbol i-logo par le PNG
$idx=Join-Path $www 'index.html'
$t=[IO.File]::ReadAllText($idx)
$pat='<symbol id="i-logo"[^>]*>.*?</symbol>'
$newSym='<symbol id="i-logo" viewBox="0 0 100 100"><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-ui.png"/></symbol>'
$t=[regex]::Replace($t,$pat,$newSym,[Text.RegularExpressions.RegexOptions]::Singleline)
[IO.File]::WriteAllText($idx,$t,$utf8)
'index.html : symbol i-logo => image PNG'

# 3) remplace tous les <use href="#i-logo" / <use xlink:href="#i-logo" dans tous les fichiers www
$count=0
Get-ChildItem -Path $www -Recurse -File -Include '*.html','*.js' | ForEach-Object {
  $p=$_.FullName
  $o=[IO.File]::ReadAllText($p)
  $c=$o
  $c=[regex]::Replace($c,'<use\b[^>]*\bhref="#i-logo"[^>]*/?>','<image x="2" y="2" width="96" height="96" href="app/icons/logo-ui.png"/>',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $c=[regex]::Replace($c,'<use\b[^>]*\bxlink:href="#i-logo"[^>]*/?>','<image x="2" y="2" width="96" height="96" href="app/icons/logo-ui.png"/>',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if($c -ne $o){
    [IO.File]::WriteAllText($p,$c,$utf8)
    $count++
  }
}
"use #i-logo remplace : $count fichiers"

# 4) nav-logo inline SVG (header) dans les autres .html -> remplace <svg ... usage i-logo ou inline star> par <img>
$p2=Join-Path $www 'app-v8.js'
if(Test-Path -LiteralPath $p2){
  $c=[IO.File]::ReadAllText($p2)
  $o=$c
  $c=[regex]::Replace($c,'<svg viewBox="0 0 100 100"[^>]*>.*?</svg>','<img src="app/icons/logo-ui.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:22%"/>',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($c -ne $o){ [IO.File]::WriteAllText($p2,$c,$utf8); 'app-v8.js logo header -> img' }
}

# 5) autres .html (contact.html, pieces.html, etc.) : nav-logo inline svg star -> <img>
$n=0
Get-ChildItem -Path $www -Filter *.html -File | Where-Object { $_.Name -ne 'index.html' } | ForEach-Object {
  $p=$_.FullName
  $c=[IO.File]::ReadAllText($p)
  $o=$c
  $c=[regex]::Replace($c,'<a\s+href="[^"]*"[^>]*class="nav-logo"[^>]*>\s*<svg viewBox="0 0 100 100"[^>]*>.*?</svg>','<a href="index.html" class="nav-logo" aria-label="C-AUTO - accueil"><img src="app/icons/logo-ui.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:22%"/>',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($c -ne $o){ [IO.File]::WriteAllText($p,$c,$utf8); $n++ }
}
"nav-logo -> img : $n fichiers"
'FIN OK'