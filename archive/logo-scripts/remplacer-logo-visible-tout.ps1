$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$wwwApp=Join-Path $www 'app'
$icons=Join-Path $www 'app\icons'
$utf8=New-Object System.Text.UTF8Encoding($false)
$utf8bom=New-Object System.Text.UTF8Encoding($true)

$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $hit=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($hit){ $src=$hit.FullName } else { throw 'PNG absent' }
}
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)){ throw 'pas un png' }
$utf8=New-Object System.Text.UTF8Encoding($false)

# img tag a injecter
$imgTag='<img src="app/icons/logo-app.png" alt="C-AUTO" style="height:28px;width:28px;border-radius:22%;object-fit:cover;vertical-align:middle">'

# --- 1) copie le PNG vers app/icons/logo-app.png ---
$logoApp=Join-Path $icons 'logo-app.png'
Copy-Item -LiteralPath $src -Destination $logoApp -Force
$img=[System.Drawing.Image]::FromFile($logoApp)
'SOURCE '+$src+'  '+$img.Width+'x'+$img.Height
$img.Dispose()

# --- 2) remplacer TOUS les <use href="#i-logo"> et <use xlink:href="#i-logo"> dans tous les .html ---
$n=0
Get-ChildItem -Path $www -Filter '*.html' -File -Recurse | ForEach-Object {
  $p=$_.FullName
  $text=[IO.File]::ReadAllText($p)
  $orig=$text
  $text=[regex]::Replace($text,'<use\b[^>]*\bhref="#i-logo"[^>]*/?>',$imgTag,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $text=[regex]::Replace($text,'<use\b[^>]*\bxlink:href="#i-logo"[^>]*/?>',$imgTag,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if($text -ne $orig){
    [IO.File]::WriteAllText($p,$text,$utf8)
    $n++
    '  '+$_.Name
  }
}
"<use #i-logo> -> img : $n fichier(s)"

# --- 3) index.html : remplacer le contenu du symbol i-logo par un image raster ---
$idx=Join-Path $www 'index.html'
$text=[IO.File]::ReadAllText($idx)
$orig=$text
$text=[regex]::Replace($text,'<symbol id="i-logo"[^>]*>.*?</symbol>','<symbol id="i-logo" viewBox="0 0 100 100"><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-app.png"/><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" xlink:href="app/icons/logo-app.png"/></symbol>',[Text.RegularExpressions.RegexOptions]::Singleline)
if($text -ne $orig){
  [IO.File]::WriteAllText($idx,$text,$utf8)
  'index.html : symbol i-logo -> image raster OK'
} else { 'WARN : i-logo symbol absent dans index.html' }

'--- TERMINE ---'