$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

$rep='C:\Users\utilisateur\Documents\Default Project'
$www=Join-Path $rep 'frontend\www'
$app=Join-Path $www 'app'
$utf8=New-Object System.Text.UTF8Encoding($false)

# --- source PNG ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $h=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($h){ $src=$h.FullName } else { throw 'PNG introuvable' }
}
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)){ throw 'pas PNG' }
$img=[System.Drawing.Image]::FromFile($src)
$srcW=$img.Width; $srcH=$img.Height
'SOURCE : '+$src+'   '+$srcW+'x'+$srcH
$img.Dispose()

# --- copie dans app\icons ---
$icons=Join-Path $app 'icons'
if(-not(Test-Path -LiteralPath $icons)){ New-Item -ItemType Directory -Path $icons -Force | Out-Null }
$logoPng=Join-Path $icons 'logo-app.png'
Copy-Item -LiteralPath $src -Destination $logoPng -Force
'COPIE : '+$logoPng

$imgTag='<img src="icons/logo-app.png" alt="C-AUTO" style="width:30px;height:30px;border-radius:24%;object-fit:cover;vertical-align:middle" />'

# --- cibles: les fichiers de l app qui dessinent le logo (SVG inline) ---
$cibles=@('views-modules-v2.js','app-v8.js','app-v8-modules.js')
foreach($name in $cibles){
  $p=Join-Path $app $name
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # 1) sidebar-brand : <svg ...car...></svg> -> img
  $t=[regex]::Replace($t,'(class="sidebar-brand"[^>]*>)\s*<svg\b[^>]*>.*?</svg>','$1'+$imgTag,[Text.RegularExpressions.RegexOptions]::Singleline)
  # 2) logo-big (page login/accueil)
  $t=[regex]::Replace($t,'(<div class="logo-big"[^>]*>)\s*<svg\b[^>]*>.*?</svg>','$1'+$imgTag,[Text.RegularExpressions.RegexOptions]::Singleline)
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    '  '+$name+' : sidebar-brand + logo-big SVG -> img PNG'
  } else {
    '  '+$name+' : (aucune cible trouvee, modele different)'
  }
}

# --- remplace aussi logo-big / conv svg dans views-modules-v2.js si inline dans un string ---
$p=Join-Path $app 'views-modules-v2.js'
$t=[IO.File]::ReadAllText($p)
$o=$t
# car inline : motif general <svg ...>...</svg> contenant cl2/cl1 l'etoile C-AUTO entre guillemets (string JS)
$hasCar=$t -match 'M50 25 58 44 78 44'
if($hasCar){
  '  models : inline car SVG present (a remplacer par img moderne)'
}
'FIN OK'