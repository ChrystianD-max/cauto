$ErrorActionPreference='Stop'
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$appDir=Join-Path $www 'app'
$utf8=New-Object System.Text.UTF8Encoding($false)

# --- 1) PNG source (celui deja copie dans app\icons) ---
$png=Join-Path $appDir 'icons\logo-app.png'
if(-not(Test-Path -LiteralPath $png)){ throw 'logo-app.png absent' }

$imgSide='<img src="icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover;vertical-align:middle" /> '
$imgBig='<img src="icons/logo-app.png" alt="C-AUTO" style="height:64px;width:64px;border-radius:30%;object-fit:cover" /> '

# --- 2) fichiers cibles : scripts JS qui construisent le logo de l app ---
$targets=@(
  (Join-Path $appDir 'views-modules-v2.js'),
  (Join-Path $appDir 'app-v8.js'),
  (Join-Path $appDir 'views-modules-v2.js'),
  (Join-Path $appDir 'app-v8-modules.js')
)
$utf8bom=New-Object System.Text.UTF8Encoding($true)

$utf8w=New-Object System.Text.UTF8Encoding($false)
foreach($p in $targets){
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t

  # sidebar-brand : remplace le <svg>...</svg> (dessin voiture) par <img>
  $t=[regex]::Replace($t,'<(div|span)\s+class="sidebar-brand"[^>]*>\s*<svg\b[^>]*>.*?</svg>','<div class="sidebar-brand">'+$imgSide,[Text.RegularExpressions.RegexOptions]::Singleline)
  # logo-big
  $t=[regex]::Replace($t,'<div\s+class="logo-big"[^>]*>\s*<svg\b[^>]*>.*?</svg>','<div class="logo-big">'+$imgBig,[Text.RegularExpressions.RegexOptions]::Singleline)
  # sidebar-logo / mock / etc.
  $t=[regex]::Replace($t,'<(div|span)\s+class="sidebar-logo"[^>]*>\s*<svg\b[^>]*>.*?</svg>','<div class="sidebar-logo">'+$imgSide,[Text.RegularExpressions.RegexOptions]::Singleline)

  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8w)
    '  OK : '+([IO.Path]::GetFileName($p))
  } else {
    '  (aucun changement) : '+([IO.Path]::GetFileName($p))
  }
}
'--- verification rapide : plus de svg voiture inline dans les js cibles ---'
foreach($p in $targets){
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $hasSvg=$t -match '<svg\b[^>]*>.*?</svg>'
  $hasImg=$t -match 'logo-app\.png'
  '  '+[IO.Path]::GetFileName($p)+'  reste-svg='+$hasSvg+'  img-logo='+$hasImg
}
'FIN'