$ErrorActionPreference='Stop'
$utf8=New-Object System.Text.UTF8Encoding($false)
$wwwRoot='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$app=Join-Path $wwwRoot 'app'
$utf8w=New-Object System.Text.UTF8Encoding($false)
$fx=New-Object System.Text.UTF8Encoding($false)
$imgSide='<img src="icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover;vertical-align:middle" />'
$imgBig='<img src="icons/logo-app.png" alt="C-AUTO" style="height:64px;width:64px;border-radius:30%;object-fit:cover" />'

$targets=@(
  (Join-Path $app 'views-modules-v2.js'),
  (Join-Path $app 'app-v8.js')
)
$rx=[Text.RegularExpressions.RegexOptions]::Singleline
foreach($p in $targets){
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # sidebar-brand : div + svg de la voiture -> img
  $t=[regex]::Replace($t,'<div class="sidebar-brand">\s*<svg\b[^>]*>.*?</svg>','<div class="sidebar-brand">'+$imgSide,$rx)
  # logo-big : div + svg -> img
  $t=[regex]::Replace($t,'<div class="logo-big">\s*<svg\b[^>]*>.*?</svg>','<div class="logo-big">'+$imgBig,$rx)
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$f)
    '  '+[IO.Path]::GetFileName($p)+' : sidebar-brand + logo-big SVG -> img PNG (OK)'
  } else {
    '  '+[IO.Path]::GetFileName($p)+' : (motif non trouve - verifier)'
  }
}
'FIN'