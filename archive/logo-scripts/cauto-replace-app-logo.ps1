$ErrorActionPreference='Stop'
$utf8=New-Object System.Text.UTF8Encoding($false)
$name='cauto-replace-app-logo'
$wwwRoot='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$www=Join-Path $wwwRoot 'www'
$wwwApp=Join-Path $www 'app'
$app=Join-Path $wwwRoot 'app'

$targets=@(
  (Join-Path $wwwApp 'views-modules-v2.js'),
  (Join-Path $wwwApp 'app-v8.js')
)
$imgTag='<img src="icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover;vertical-align:middle" />'

foreach($p in $targets){
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  $t=[regex]::Replace($t,'<svg\s+class="sidebar-brand"[^>]*>.*?</svg>',$imgTag,[Text.RegularExpressions.RegexOptions]::Singleline)
  $t=[regex]::Replace($t,'<svg\s+class="logo-big"[^>]*>.*?</svg>','<img src="icons/logo-app.png" alt="C-AUTO" style="height:60px;width:60px;border-radius:24%;object-fit:cover" />',[Text.RegularExpressions.RegexOptions]::Singleline)
  $t=[regex]::Replace($t,'<svg\b[^>]*viewBox="0 0 100 100"[^>]*>.*?</svg>',$imgTag,[Text.RegularExpressions.RegexOptions]::Singleline)
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    '  '+[IO.Path]::GetFileName($p)+' : SVG inline -> img PNG (OK)'
  } else {
    '  '+[IO.Path]::GetFileName($p)+' : (aucun SVG matching)'
  }
}
'FIN'