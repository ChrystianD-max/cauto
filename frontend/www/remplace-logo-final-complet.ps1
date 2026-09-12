$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$sub=Join-Path $www 'app'
$utf8=New-Object System.Text.UTF8Encoding($false)

# ---------- 1. LOCALISER LA SOURCE (PNG carre) ----------
$hits=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue
if(-not $hits -or $hits.Count -eq 0){
  $hits=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter '*.png' -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt 100000 -and $_.Length -lt 2000000 }
}
$src=($hits | Select-Object -First 1).FullName
if(-not $src){ throw 'Aucun PNG source trouve' }
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[4]-eq 0x50 -and $b[5]-eq 0x4E -and $b[6]-eq 0x47)){ throw 'Pas un PNG valide' }
'SOURCE : '+$src

# ---------- 2. FORMATER EN CARRE + REDIMENSIONNER (icone de nav) ----------
function Get-Rounded($size,$padding){
  $bmp=New-Object System.Drawing.Bitmap($size,$size,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode='AntiAlias'
  $g.InterpolationMode='HighQualityBicubic'
  $g.PixelOffsetMode='HighQuality'
  $r=[System.Drawing.Icon]::FromHandle([IntPtr]::Zero) # noop
  # dessine l'image source remplissant le carre
  $g.DrawImage($srcImage,0,0,$size,$size)
  $g.Dispose()
  return $bmp
}

# ---------- 3. Copier le PNG vers app/icons/logo-app.png + logo.png ----------
$icons=Join-Path $sub 'icons'
if(-not(Test-Path -LiteralPath $icons)){ New-Item -ItemType Directory -Path $icons -Force | Out-Null }
$logoApp=Join-Path $icons 'logo-app.png'

# charger image source
$srcImage=[System.Drawing.Image]::FromFile($src)
$sw=$srcImage.Width; $sh=$srcImage.Height
"  SOURCE : $sw x $sh (carre="+($sw -eq $sh)+")"

# copier tel quel d'abord
Copy-Item -LiteralPath $src -Destination $logoApp -Force
'  Copie : app/icons/logo-app.png'

# ---------- 4. REMPLACER LE LOGO AFFICHE (i-logo) dans index.html ----------
$idx=Join-Path $www 'index.html'
$text=[IO.File]::ReadAllText($idx)
"index.html contient i-logo : "+$text.Contains('i-logo')

# Le symbole i-logo dans index.html :
$newSymbol='<symbol id="i-logo" viewBox="0 0 100 100"><image x="0" y="0" width="100" height="100" href="app/icons/logo-app.png" preserveAspectRatio="xMidYMid meet"/></symbol>'

# On repère le bloc <symbol id="i-logo">...</symbol>
$pattern='<symbol[^>]*id="i-logo"[^>]*>.*?</symbol>'
$match=[regex]::Match($text,$pattern,[Text.RegularExpressions.RegexOptions]::Singleline)
if($match.Success){
  $text=$text.Substring(0,$match.Index)+$newSymbol+$text.Substring($match.Index+$match.Length)
  "  index.html : symbol i-logo remplace (SVG -> image PNG)"
}

# Remplacer les <use href="#i-logo"> par un <img>
$imgIn='<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:28px;height:28px;border-radius:24%;vertical-align:middle">'
$text=[regex]::Replace($text,'<use\b[^>]*\bhref="#i-logo"[^>]*/?>',$imgIn,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
$text=[regex]::Replace($text,'<use\b[^>]*\bxlink:href="#i-logo"[^>]*/?>',$imgIn,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
'  index.html : <use #i-logo> -> <img>'

[IO.File]::WriteAllText($idx,$text,$utf8)

# ---------- 5. AUTRES PAGES HTML ----------
$n=0
Get-ChildItem -Path $www -Filter '*.html' -File | ForEach-Object {
  $p=$_.FullName
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  if($t -match 'nav-logo' ){
    # nav-logo inline svg (dessin) -> img
    $t=[regex]::Replace($t,'(<a\b[^>]*\bclass="[^"]*nav-logo[^"]*"[^>]*>)\s*<svg\b[^>]*>.*?</svg>\s*','$1'+$imgIn,[Text.RegularExpressions.RegexOptions]::Singleline)
    if($t -ne $o){
      [IO.File]::WriteAllText($p,$t,$utf8)
      $n++;
      "   page : "+$_.Name
    }
  }
}
"  Pages modifiees : $n"

# ---------- 6. BUMP sw.js ----------
$sw=Join-Path $www 'app\sw.js'
$swt=[IO.File]::ReadAllText($sw)
$m=[regex]::Match($swt,"CACHE_NAME\s*=\s*['""]([^'""]+)['""]")
$old=$m.Groups[1].Value
$v=[regex]::Match($old,'v(\d+)$')
$nv='v'+([int]$v.Groups[1].Value+1)
$newname=$old.Substring(0,$old.Length-$v.Groups[0].Length)+$nv
$swt=[regex]::Replace($swt,"CACHE_NAME\s*=\s*['""][^'""]+['""]","CACHE_NAME = '$newname'")
[IO.File]::WriteAllText($sw,$swt,$utf8)
"  sw.js : $old -> $newname"

# ---------- 7. COMMIT + PUSH ----------
$repo='C:\Users\utilisateur\Documents\Default Project'
Set-Location -LiteralPath $repo
git add -A 2>&1 | Out-Null
git -c user.name='C-AUTO' -c user.email='cauto@local' commit -m "remplace i-logo (SVG) par le PNG fourni dans toutes les pages" 2>&1 | Out-Null
git push origin HEAD:main 2>&1 | Out-Null
$h=git rev-parse HEAD
$rm=git ls-remote origin refs/heads/main
"  HEAD : $h"
"  origin/main : "+($rm -split "\s+")[0]
"  IDENTIQUES : "+((($rm -split "\s+")[0]) -eq $h)
'FIN SCRIPT OK'