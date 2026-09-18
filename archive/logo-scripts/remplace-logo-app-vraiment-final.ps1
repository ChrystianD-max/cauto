$ErrorActionPreference='Stop'
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$app=Join-Path $www 'app'
$utf8=New-Object System.Text.UTF8Encoding($false)
$iconsDir=Join-Path $app 'icons'
$png=Join-Path $iconsDir 'logo-app.png'
if(-not(Test-Path -LiteralPath $png)){ throw 'PNG manquant' }
$imgTag='<img src="icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover;vertical-align:middle" />'

$files=@(
 'views-modules-v2.js',
 'app-v8.js',
 'views-modules-v2.js'
)
$n=0
foreach($f in $files){
  $p=Join-Path $app $f
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # sidebar-brand : remplace <div class="sidebar-brand"><svg...>...</svg><span>C-AUTO...</span></div> par img
  $pat1='<div class="sidebar-brand">.*?</div>'
  $t=[regex]::Replace($t,'<div class="sidebar-brand">\s*<svg\b[^>]*>.*?</svg>\s*<span[^>]*>.*?</span>\s*</div>','<div class="sidebar-brand">'+$imgTag+'</div>',[Text.RegularExpressions.RegexOptions]::Singleline)
  # logo-big (page login/404) : <div class="logo-big"><svg...>...</svg> C-AUTO</div>
  $t=[regex]::Replace($t,'<div class="logo-big">.*?</div>','<div class="logo-big">'+$imgTag+'</div>',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    $n++
    '  '+$f
  }
}
"remplacements : "+$n
'--- bump sw ---'
$sw=Join-Path $app 'sw.js'
if(Test-Path -LiteralPath $sw){
  $t=[IO.File]::ReadAllText($sw)
  if($t -match 'CACHE_NAME\s*=\s*"([^"]+v\d+)"'){
    $old=$Matches[1]
    $new='cauto-pwa-v'+([int](($old -replace '.*v',''))+1)
    $t=$t.Replace($old,$new)
    [IO.File]::WriteAllText($sw,$t,$utf8)
    "  sw : "+$old+" -> "+$new
  }
}
'FIN'
