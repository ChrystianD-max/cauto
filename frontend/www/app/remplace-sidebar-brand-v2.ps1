$ErrorActionPreference='Stop'
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$app=Join-Path $www 'app'
$utf8=New-Object System.Text.UTF8Encoding($false)
$imgTag='<img src="icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover;vertical-align:middle" />'

$files=@('views-modules-v2.js','app-v8.js')
foreach($name in $files){
  $p=Join-Path $app $name
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # 1) div sidebar-brand : <div class="sidebar-brand">...<svg>...</svg>...<span>...</span></div>
  $t=[regex]::Replace($t,'<div class="sidebar-brand"[^>]*>.*?</div>','<div class="sidebar-brand">'+$imgTag+'</div>',[Text.RegularExpressions.RegexOptions]::Singleline)
  # 2) logo-big grand (login page dans l app)
  $t=[regex]::Replace($t,'<div class="logo-big"[^>]*>.*?</div>','<div class="logo-big">'+$imgBig+'</div>',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    '  '+$name+' : sidebar-brand + logo-big -> img PNG'
  } else {
    '  '+$name+' : (aucune correspondance sidebar-brand/logo-big)'
  }
}
'FIN'