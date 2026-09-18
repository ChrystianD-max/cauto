$ErrorActionPreference='Stop'
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$utf8=New-Object System.Text.UTF8Encoding($false)
$utf8Bom=New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Drawing
$iconsDir=Join-Path $www 'app\icons'
$logoPng=Join-Path $iconsDir 'logo-app.png'
$logoAlt=Join-Path $iconsDir 'logo.png'
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $h=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($h){ $src=$h.FullName } else { throw 'PNG introuvable' }
}
Copy-Item -LiteralPath $src -Destination $logoPng -Force
Copy-Item -LiteralPath $src -Destination $logoAlt -Force
"PNG -> icons : OK  ($logoPng)"

# helper : tag img ui
$imgTag='<img src="app/icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:22%" />'

# --- 1) index.html : remplace le <symbol id="i-logo">...</symbol> par <img> direct dans chaque <use> ---
$files=Get-ChildItem -Path $www -Filter *.html -File
foreach($f in $files){
  $p=$f.FullName
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # remplace <use href="#i-logo"/> (et xlink)
  $t=[regex]::Replace($t,'<use\b[^>]*\bhref="#i-logo"[^>]*/?>',$imgTag,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $t=[regex]::Replace($t,'<use\b[^>]*\bxlink:href="#i-logo"[^>]*/?>',$imgTag,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    "  ^ "+$f.Name+" : <use #i-logo> -> img"
  }
}

# --- 2) rien d'autre (le symbol i-logo reste defini, inoffensif) ---
'FINI - logos : index + toutes pages .html remplacees'
