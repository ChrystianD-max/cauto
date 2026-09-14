$ErrorActionPreference='Stop'
$utf8=New-Object System.Text.UTF8Encoding($false)
$manger="<img src=\"icons/logo-app.png\" alt=\"C-AUTO\" style=\"height:30px;width:30px;border-radius:24%;object-fit:cover;vertical-align:middle\" />"
$f1='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\app-v8.js'
$f2='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\views-modules-v2.js'
foreach($f in @($f1,$f2)){
  if(-not(Test-Path -LiteralPath $f)){ continue }
  $t=[IO.File]::ReadAllText($f)
  $o=$t
  $t=[regex]::Replace($t,'<div class="sidebar-brand"[^>]*>\s*<svg\b[^>]*>.*?</svg>\s*<span[^>]*>.*?</span>\s*</div>','<div class=\"sidebar-brand\">'+$manger+'</div>',[Text.RegularExpressions.RegexOptions]::Singleline)
  $t=[regex]::Replace($t,'<div class="sidebar-brand"[^>]*>\s*<svg\b[^>]*>.*?</svg>(?:\s*<span[^>]*>.*?</span>)?\s*</div>','<div class=\"sidebar-brand\">'+$manger+'</div>',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($t -ne $o){
    [IO.File]::WriteAllText($f,$t,$utf8)
    '  '+$f.Replace('C:\Users\utilisateur\Documents\Default Project\frontend\www\','')+' : sidebar-brand SVG -> img OK'
  } else { '  '+$f.Replace('C:\Users\utilisateur\Documents\Default Project\frontend\www\','')+' : (rien change, motif absent)' }
}
# --- bump sw + commit + push ---
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$swp=Join-Path $www 'app\sw.js'
$t=[IO.File]::ReadAllText($swp)
$m=[regex]::Match($t,'CACHE_NAME\s*=\s*[''""]([^''""]+)[''""]')
$old=$m.Groups[1].Value
$v=[regex]::Match($old,'v(\d+)$')
$new='v'+([int]$v.Groups[1].Value+1)
$t=[regex]::Replace($t,[regex]::Escape($old),$new)
[IO.File]::WriteAllText($swp,$t,$utf8)
'sw : '+$old+' -> '+$new
# --- git ---
$rep='C:\Users\utilisateur\Documents\Default Project'
Set-Location -LiteralPath $rep
git add -A 2>&1 | Out-Null
git -c user.name='C-AUTO' -c user.email='cauto@local' commit -m "app: logo sidebar SVG -> image PNG (logo-app)" 2>&1 | Out-Null
git push origin HEAD:main 2>&1 | Out-Null
'HEAD        : '+(git rev-parse HEAD).Substring(0,11)
'origin/main : '+(git rev-parse origin/main).Substring(0,11)
'FIN'