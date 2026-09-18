$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'

# --- source PNG ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $h=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($h){ $src=$h.FullName } else { throw 'introuvable' }
}
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)){ throw 'pas PNG' }
$img=[System.Drawing.Image]::FromFile($src)
'SOURCE : '+$src+' -> '+$img.Width+'x'+$img.Height
$img.Dispose()

# --- copie dans icons (deja fait par regen mais on re-copie 1:1) ---
$ic=Join-Path $www 'app\icons\logo-app.png'
Copy-Item -LiteralPath $src -Destination $ic -Force
Copy-Item -LiteralPath $src -Destination (Join-Path $www 'app\icons\logo.png') -Force
'OK icon LogoInGui: '+([IO.File]::ReadAllBytes($ic).Length)+' B'

$utf8=New-Object System.Text.UTF8Encoding($false)
$relSrc=@"
<symbol id="i-logo" viewBox="0 0 100 100"><image x="无名" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-app.png"/></symbol>
"@

# --- 1) index.html : remplace le contenu du symbole i-logo par une image raster ---
$idx=Join-Path $www 'index.html'
$t=[IO.File]::ReadAllText($idx)
$m=[regex]::Match($t,'<symbol id="i-logo"[^>]*>.*?</symbol>',[Text.RegularExpressions.RegexOptions]::Singleline)
if($m.Success){
  $sym='<symbol id="i-logo" viewBox="0 0 100 100"><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-app.png"/></symbol>'
  $t=$t.Substring(0,$m.Index)+$sym+$t.Substring($m.Index+$m.Length)
  [IO.File]::WriteAllText($idx,$t,$utf8)
  'index.html : symbole i-logo -> image raster'
} else { 'index.html : PAS de symbol i-logo (skip)' }

# --- 2) tous les autres html : remplace l'inline SVG du nav-logo (dessin C-AUTO) par un img ---
$html=Get-ChildItem -Path $www -Filter '*.html' -File
$pat='(<a[^>]*class="nav-logo"[^>]*>)\s*<svg[^>]*>.*?</svg>\s*'
foreach($f in $html){
  $p=$f.FullName
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  if($t -match 'nav-logo'){
    $t=[regex]::Replace($t,'(<a[^>]*class="nav-logo"[^>]*>)\s*<svg[^>]*>.*?</svg>\s*','$1<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:34px;height:34px;border-radius:24%"> ',[Text.RegularExpressions.RegexOptions]::Singleline)
  }
  if($t -ne $o){ [IO.File]::WriteAllText($p,$t,$utf8); '  '+$f.Name+' : nav-logo -> img' }
  else { '  '+$f.Name+' : (aucun nav-logo)' }
}

# --- 3) app/index.html (header sidebar inline) + app-v8.js ---
$ai=Join-Path $www 'app\index.html'
if(Test-Path -LiteralPath $ai){
  $t=[IO.File]::ReadAllText($ai)
  $t=[regex]::Replace($t,'<div class="sidebar-brand">.*?</div>',('<div class="sidebar-brand"><img src="app/icons/logo-app.png" alt="C-AUTO" style="width:28px;height:28px;border-radius:24%;vertical-align:middle"> <span>C-AUTO</span></div>'),[Text.RegularExpressions.RegexOptions]::Singleline)
  [IO.File]::WriteAllText($ai,$t,$utf8)
  'app/index.html : sidebar-brand -> img'
}
$aj=Join-Path $www 'app\views-modules-v2.js'
if(Test-Path -LiteralPath $aj){
  $t=[IO.File]::ReadAllText($aj)
  $t=[regex]::Replace($t,'<symbol id="i-logo"[^>]*>.*?</symbol>','<symbol id="i-logo" viewBox="0 0 100 100"><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="icons/logo-app.png"/></symbol>',[Text.RegularExpressions.RegexOptions]::Singleline)
  [IO.File]::WriteAllText($aj,$t,$utf8)
  'views-modules-v2.js : symbole i-logo -> image'
}
'--- fin ---'
