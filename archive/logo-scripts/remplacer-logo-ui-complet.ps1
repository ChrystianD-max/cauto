$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$utf8=New-Object System.Text.UTF8Encoding($false)
$utf8Bom=New-Object System.Text.UTF8Encoding($true)

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$iconsDir=Join-Path $www 'app\icons'
$logoPng=Join-Path $iconsDir 'logo-app.png'      # version UI
$logoPng2=Join-Path $iconsDir 'logo.png'
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'

# --- 1) trouve la source PNG (verifie) ---
if(-not(Test-Path -LiteralPath $src)){
  $cand=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($cand){ $src=$cand.FullName } else { throw 'PNG introuvable' }
}
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)){ throw 'pas un PNG' }
$img=[System.Drawing.Image]::FromFile($src)
'SOURCE : '+$src+'  ('+$img.Width+'x'+$img.Height+')'
$carre=($img.Width -eq $img.Height)
'  carre='+$carre
$img.Dispose()

# --- 2) copie en logo-app.png + logo.png ---
if(-not(Test-Path -LiteralPath $iconsDir)){ New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null }
Copy-Item -LiteralPath $src -Destination $logoPng -Force
Copy-Item -LiteralPath $src -Destination $logoPng2 -Force
'PLACE : '+$logoPng
'        '+$logoPng2

# --- 3) widget: replace <symbol id="i-logo"> CONTENU dans index.html (sprite) ---
$idx=Join-Path $www 'index.html'
$t=[IO.File]::ReadAllText($idx)
$o=$t
# remplace le contour SVG du symbole par un <image> raster
$t=[regex]::Replace($t,'<symbol id="i-logo"[^>]*>.*?</symbol>','<symbol id="i-logo" viewBox="0 0 100 100"><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" xlink:href="app/icons/logo-app.png"/><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-app.png"/></symbol>',[Text.RegularExpressions.RegexOptions]::Singleline)
if($t -ne $o){
  [IO.File]::WriteAllText($idx,$t,$utf8)
  'index.html : symbol i-logo -> image (RASTER) OK'
}else{ '!! index.html : symbol i-logo NON trouve' }

# --- 4) remplace TOUS les <use href="#i-logo" / xlink> par <img> dans les pages .html ---
$imgTag='<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:28px;height:28px;border-radius:24%;object-fit:cover;vertical-align:middle" />'
$count=0
Get-ChildItem -Path $www -Filter '*.html' -File -Recurse | ForEach-Object {
  $fp=$_.FullName
  $c=[IO.File]::ReadAllText($fp)
  $old=$c
  $c=[regex]::Replace($c,'<use\b[^>]*?\bhref="#i-logo"[^>]*?/?\s*>',$imgTag,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $c=[regex]::Replace($c,'<use\b[^>]*?\bxlink:href="#i-logo"[^>]*?/?\s*>',$imgTag,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if($c -ne $old){
    [IO.File]::WriteAllText($fp,$c,$utf8)
    $count++
    '  remplace : '+$_.Name
  }
}
'<use #i-logo> -> <img> : '+$count+' fichier(s)'
'--- FIN REGENERATION UI ---'