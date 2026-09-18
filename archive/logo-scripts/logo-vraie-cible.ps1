$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$utf8=New-Object System.Text.UTF8Encoding($false)

# --- 1) source ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
$b=[IO.File]::ReadAllBytes($src)
$img=[System.Drawing.Image]::FromFile($src)
'Src : '+$src
'  '+$img.Width+'x'+$img.Height+'  carre='+($img.Width -eq $img.Height)
$img.Dispose()

# --- 2) permette l'affichage via CSS background si besoin ---
$icons=Join-Path $www 'app\icons'
$ic=Join-Path $icons 'logo-app.png'
Copy-Item -LiteralPath $src -Destination $ic -Force

# --- 3) index.html : remplace le contenu du symbol i-logo par <image href Png> ---
$idx=Join-Path $www 'index.html'
$t=[IO.File]::ReadAllText($idx)
$pat='<symbol id="i-logo"[^>]*>.*?</symbol>'
$m=[regex]::Match($t,$pat,[Text.RegularExpressions.RegexOptions]::Singleline)
if(-not $m.Success){ throw 'symbol i-logo introuvable' }
$newSym='<symbol id="i-logo" viewBox="0 0 100 100"><image x="5" y="5" width="90" height="90" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-app.png"/></symbol>'
$t=$t.Substring(0,$m.Index)+$newSym+$t.Substring($m.Index+$m.Length)
[IO.File]::WriteAllText($idx,$t,$utf8)
'index.html : symbol i-logo -> image PNG OK'

# --- 4) les autres pages : logo inline (nav-logo svg) -> remplacer le dessin par <img> ---
$others=@('contact.html','pieces.html','professionnels.html','confidentialite.html','conditions.html','offline.html','aide.html','comment-ca-marche.html','entreprises.html','app\index.html','app\aide.html')
foreach($rel in $others){
  $p=Join-Path $www $rel
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $o=[IO.File]::ReadAllText($p)
  $imgTag='<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:26px;height:26px;object-fit:cover;border-radius:26%"> '
  # remplacer tout <svg ... aria-hidden="true">...</svg> qui precede le wordmark dans la nav-logo
  $n=$o
  # variante la plus simple : remplacer le <svg ...>...</svg> dans l'ancre nav-logo/nav-logo
  $n=[regex]::Replace($n,'(<a\b[^>]*\bclass="(?:nav-logo|nav-logo|nav-logo-logo|sidebar-logo|mock-logo|footer-logo)"[^>]*>\s*)<svg\b[^>]*>.*?</svg>',('$1'+$imgTag),[Text.RegularExpressions.RegexOptions]::Singleline)
  if($n -ne $o){
    [IO.File]::WriteAllText($p,$n,$utf8)
    '  '+$rel+' : nav-logo svg -> img'
  } else {
    '  '+$rel+' : (pas de nav-logo cible)'
  }
}
'--- fait ---'
