$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$utf8=New-Object System.Text.UTF8Encoding($false)

# --- source ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $h=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($h){ $src=$h.FullName } else { throw 'PNG introuvable' }
}
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)){ throw 'pas un PNG' }
$im=[System.Drawing.Image]::FromFile($src)
'SOURCE : '+$src+'  '+$im.Width+'x'+$im.Height+'  carre='+($im.Width -eq $im.Height)
$im.Dispose()

# --- copie vers icons ---
$icDir=Join-Path $www 'app\icons'
if(-not(Test-Path -LiteralPath $icDir)){ New-Item -ItemType Directory -Path $icDir -Force | Out-Null }
$cible=Join-Path $icDir 'logo-app.png'
Copy-Item -LiteralPath $src -Destination $cible -Force
$cible2=Join-Path $icDir 'logo.png'
Copy-Item -LiteralPath $src -Destination $cible2 -Force
'Copie : '+(Split-Path $cible -Leaf)+' + logo.png'

# --- index.html : symbol i-logo -> image raster ---
$idx=Join-Path $www 'index.html'
$t=[IO.File]::ReadAllText($idx)
$o=$t
# nouveau contenu du symbol (dessin doublé -> sprite ref image)
$pat='<symbol id="i-logo"[^>]*>.*?</symbol>'
if($t -match $pat){
  $t=[regex]::Replace($t,$pat,'<symbol id="i-logo" viewBox="0 0 100 100"><image x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-app.png" xlink:href="app/icons/logo-app.png"/></symbol>',[Text.RegularExpressions.RegexOptions]::Singleline)
}else{ ' !! index.html : PAS de symbol i-logo ?!' }
# remplace les <use href="#i-logo"> par <image src=...> direct (plus sûr que sprite cache)
$t=[regex]::Replace($t,'<use\b[^>]*\bhref="#i-logo"[^>]*/?>','<img src="app/icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%">',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
if($t -ne $o){
  [IO.File]::WriteAllText($idx,$t,$utf8)
  'index.html : symbol + use -> img (ok)'
}else{ '!! index.html : aucun changement effectue' }

# --- recense les autres fichiers utilisant le C-AUTO SVG inline ---
'--- fichiers restants avec un SVG car-screen inline (nav/footer) : A CORRIGER ENSEMBLE ---'
Get-ChildItem -Path $www -Filter '*.html' -File | ForEach-Object {
  $c=[IO.File]::ReadAllText($_.FullName)
  if($c -match 'M50 25|M50 63|58 44' -and $c -notmatch 'i-logo'){
    '  '+$_.Name
  }
}
'--- TERMINE ---'