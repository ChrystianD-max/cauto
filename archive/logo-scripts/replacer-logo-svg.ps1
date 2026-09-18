$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'

# --- source : PNG fourni (OneDrive Pictures) ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $h=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($h){ $src=$h.FullName } else { throw 'PNG introuvable' }
}
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)){ throw 'pas un PNG' }
$img=[System.Drawing.Image]::FromFile($src)
'Src : '+$src+'  '+$img.Width+'x'+$img.Height
$img.Dispose()

# --- fichiers cibles ---
$files=@(
  'index.html',
  'contact.html',
  'pieces.html',
  'professionnels.html',
  'confidentialite.html',
  'conditions.html',
  'comment-ca-marche.html',
  'offline.html',
  'app\index.html',
  'app\aide.html',
  'app\offline.html'
)
$utf8=New-Object System.Text.UTF8Encoding($false)
foreach($rel in $files){
  $p=Join-Path $www $rel
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # 1) remplacer la definition du symbole i-logo : on la supprime pour forcer l usage image ci-dessous
  # 2) remplacer tout <use href="#i-logo" .../> / <use xlink:href="#i-logo" ... /> par un <img>
  $t=[regex]::Replace($t,'<(use|symbol)\b[^>]*\bhref="$i-logo"[^>]*/>','IMG_LOGO')
  $t=[regex]::Replace($t,'<use [^>]*href="#i-logo"[^>]*>','</svg>')  # placeholder inoffensif si non imgl
  # plus simple : on cible les balises <use ... #i-logo>
  # on remplace chaque <use ...> ... </use> ou auto-fermant
  $pat='<(svg|symbol)[^>]*>?'
  $replaced=0
  $t=[regex]::Replace($t,'<use\b[^>]*href=["'']#i-logo["''][^>]*/?>','<svg data-href="i-logo" style="overflow:visible" viewBox="0 0 32 32"><image x="0" y="0" width="32" height="32" preserveAspectRatio="xMidYMid meet" href="IMGLOGOURL"/></svg>',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if($t -ne $o){ $changed=1 } else { $changed=0 }
  $t=$t -replace 'IMGLOGOURL','app/icons/logo.png'
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    "  MIS A JOUR : $rel"
  } else {
    "  (rien)        : $rel"
  }
}
'--- fin remplacement SVG ---'
