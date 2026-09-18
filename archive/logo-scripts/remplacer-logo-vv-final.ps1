$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$wwwApp=Join-Path $www 'app'
$icons=Join-Path $wwwApp 'icons'
$utf8=New-Object System.Text.UTF8Encoding($false)
$utf8bom=New-Object System.Text.UTF8Encoding($true)

# ============ SOURCE ============
$src=$null
$hits=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
if($hits){ $src=$hits.FullName }

# verifie : un PNG 1254x1254 a deja ete copie dans icons ? (deploiement precedent)
$existing=Join-Path $icons 'logo-app.png'
if(-not(Test-Path -LiteralPath $existing)){ throw 'logo-app.png absent - regen icons d abord' }

# ============ 1) verifie la taille de l image source ============
$b=[IO.File]::ReadAllBytes($src)
$isPng=($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)
if(-not $isPng){ throw 'pas un PNG' }
$img=[System.Drawing.Image]::FromFile($src)
$sw=$img.Width; $sh=$img.Height
"SOURCE : $src  $sw x $sh"
$img.Dispose()

# ============ 2) PNG UI (pour <img> dans le header) ============
# Le style nav-logo utilise <svg><use href="#i-logo"/></svg>. On remplace le CONTENU
# du sprite symbol i-logo pour que ça affiche ton image.
$imgTag='<img src="app/icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover" />'

# ============ 3) index.html : remplace le symbol i-logo (SVG) -> image PNG ============
$idx=Join-Path $wwwApp 'index.html'
$t=[IO.File]::ReadAllText($idx)
$m=[regex]::Match($t,'<symbol id="i-logo".*?</symbol>',[Text.RegularExpressions.RegexOptions]::Singleline)
if($m.Success){
  $n=$t.Substring(0,$m.Index)+'<symbol id="i-logo-ini"'+$m.Value.Substring($m.Value.IndexOf('>')+1,$m.Value.Length-$m.Value.IndexOf('>')-9)+$t.Substring($m.Index+$m.Length)
  # on garde un vrai logo simple : on remplace TOUT le symbol par un bloc image
  $keep='<symbol id="i-logo" viewBox="0 0 100 100"><rect x="2" y="2" width="96" height="96" rx="24" fill="#0d0f15"/><rect x="2" y="2" width="96" height="96" rx="24" fill="none" stroke="#b89248" stroke-width="2.4"/><path d="M50 25 58 44 78 44 62 56 69 75 50 63 31 75 38 56 22 44 42 44Z" fill="#1d2f57" stroke="#d4af6a" stroke-width="1.8"/></symbol>'
  $t=$t.Substring(0,$m.Index)+$keep+$t.Substring($m.Index+$m.Length)
  [IO.File]::WriteAllText($idx,$t,$utf8)
  'index.html : symbol i-logo -> version simple'
}else{ 'WARNING : i-logo non trouve dans index.html' }

# ============ 4) TOUTES pages : remplace <use href="#i-logo"> ou inline par <img> ============
$files=Get-ChildItem -Path $www -Filter *.html -File -Recurse
$n=0
$imgTag2='<img src="app/icons/logo-app.png" alt="C-AUTO" style="height:30px;width:30px;border-radius:24%;object-fit:cover" />'
foreach($f in $files){
  $p=$f.FullName
  $c=[IO.File]::ReadAllText($p)
  $o=$c
  # <use href="#i-logo"/> / <use xlink:href="#i-logo"/>
  $c=[regex]::Replace($c,'<use\b[^>]*\bhref="#i-logo"[^>]*/?>',$imgTag2,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $c=[regex]::Replace($c,'<use\b[^>]*\b(?:xlink:href|href)="#i-logo"[^>]*/?>',$imgTag2,[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if($c -ne $o){
    [IO.File]::WriteAllText($p,$c,$utf8)
    $n++
    '  '+$_.Name
  }
}
"pages modifiees (use->img) : $n"

# ============ 5) views HTML dans app-v8.js (sidebar) + autres inline svg logo ============
$appjs=Join-Path $wwwApp 'app-v8.js'
if(Test-Path -LiteralPath $appjs){
  $c=[IO.File]::ReadAllText($appjs)
  $o=$c
  # /app/icons -> toujours 'app/icons/logo-app.png' (le js tourne depuis /app)
  $c=[regex]::Replace($c,'<svg[^>]*class="logo-big"[^>]*>.*?</svg>','<img src="app/icons/logo-app.png" alt="C-AUTO" class="logo-big-img" style="height:40px;width:40px;border-radius:26%;object-fit:cover" />',[Text.RegularExpressions.RegexOptions]::Singleline)
  if($c -ne $o){
    [IO.File]::WriteAllText($appjs,$c,$utf8)
    'app-v8.js : logo-big -> img'
  }
}

# ============ 6) bump service worker ============
$swp=Join-Path $wwwApp 'sw.js'
$c=[IO.File]::ReadAllText($swp)
$m=[regex]::Match($c,'CACHE_NAME\s*=\s*[`"]?([^`"`r`n]+)')
$old=$m.Groups[1].Value
$v=[regex]::Match($old,'v(\d+)')
$new='v'+([int]$v.Groups[1].Value+1)
$c=[regex]::Replace($c,[regex]::Escape($old),$new)
[IO.File]::WriteAllText($swp,$c,$utf8)
"sw.js : $old -> $new"

# ============ 7) commit + push ============
$repo='C:\Users\utilisateur\Documents\Default Project'
Set-Location -LiteralPath $repo
git add -A 2>&1 | Out-Null
git -c user.name='C-AUTO' -c user.email='cauto@local' commit -m "logo UI: remplacer i-logo SVG par le PNG fourni" 2>&1 | Out-Null
git push origin HEAD:main 2>&1 | Out-Null
$h=git rev-parse HEAD
"HEAD : $h"
"done"