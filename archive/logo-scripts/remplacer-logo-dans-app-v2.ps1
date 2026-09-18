$ErrorActionPreference='Stop'
$utf8=New-Object System.Text.UTF8Encoding($false)
$a='C:\Users\utilisateur\Documents\Default Project\frontend\www\app'
$files=@('views-modules-v2.js','app-v8.js','app-v8-modules.js')
$imgTag='<img src="icons/logo-app.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:24%;object-fit:cover;vertical-align:middle" />'

foreach($name in $files){
  $p=Join-Path $a $name
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $c=[IO.File]::ReadAllText($p)
  $o=$c
  # sidebar-brand : <svg ...>...</svg>  (une ancre/sidebar, remplace le dessin)
  $c=[regex]::Replace($c,'(class="sidebar-brand"[^>]*>)\s*<svg\b[^>]*>.*?</svg>','$1'+$imgTag,[Text.RegularExpressions.RegexOptions]::Singleline)
  # logo-big : <div class="logo-big">...<svg>...</svg></div>
  $c=[regex]::Replace($c,'<div class="logo-big">\s*<svg\b[^>]*>.*?</svg>\s*</div>','<div class="logo-big">'+$imgTag+'</div>',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($c -ne $o){
    [IO.File]::WriteAllText($p,$c,$utf8)
    '  '+$name+' : sidebar-brand + logo-big -> img PNG'
  }
}
'--- verif rapide : le PNG est-il bien servi par Render (200) ? ---'
try{
  $r=Invoke-WebRequest -Uri 'https://cauto.onrender.com/app/icons/logo-app.png' -UseBasicParsing -TimeoutSec 60
  '  HTTP '+[int]$r.StatusCode+'  '+$r.RawContentLength+' B'
}catch{ '  pas encore servi : '+((($_.Exception.Message)-split "`n")[0]) }
'FIN'