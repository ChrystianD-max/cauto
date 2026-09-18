$ErrorActionPreference='Stop'
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$app=Join-Path $www 'app'
$utf8=New-Object System.Text.UTF8Encoding($false)
$iconsDir=Join-Path $app 'icons'
$png=Join-Path $iconsDir 'logo-app.png'
if(-not(Test-Path -LiteralPath $png)){ throw 'PNG introuvable' }
$imgSide='<img src="icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover;vertical-align:middle" />'
$imgBig='<img src="icons/logo-app.png" alt="C-AUTO" style="height:64px;width:64px;border-radius:32%;object-fit:cover" />'
$rx=[Text.RegularExpressions.RegexOptions]::Singleline

$files=@(
  (Join-Path $app 'views-modules-v2.js'),
  (Join-Path $app 'app-v8.js')
)
$changed=0
foreach($p in $files){
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  $t=[regex]::Replace($t,'<div\s+class="sidebar-brand"[^>]*>\s*<svg\b[^>]*>.*?</svg>','<div class="sidebar-brand">'+$imgSide,$rx)
  $t=[regex]::Replace($t,'<div\s+class="logo-big"[^>]*>\s*<svg\b[^>]*>.*?</svg>','<div class="logo-big">'+$imgBig,$rx)
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    $changed++
    '  '+[IO.Path]::GetFileName($p)+' : logo SVG -> PNG (fait)'
  } else {
    '  '+[IO.Path]::GetFileName($p)+' : (aucun motif trouve)'
  }
}
'  fichiers modifies : '+$changed
'FIN'