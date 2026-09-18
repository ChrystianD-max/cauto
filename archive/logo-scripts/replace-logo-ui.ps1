$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

# --- 1) source = image fournie (OneDrive Pictures) ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $hits=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue
  if($hits){ $src=$hits[0].FullName } else { throw 'OGN introuvable' }
}
$bytes=[IO.File]::ReadAllBytes($src)
$pn=($bytes[0]-eq 0x89 -and $bytes[1]-eq 0x50 -and $bytes[2]-eq 0x4E -and $bytes[3]-eq 0x47)
if(-not $pn){ throw 'PAS UN PNG' }
$img=[System.Drawing.Image]::FromFile($src)
$w=$img.Width; $h=$img.Height; $img.Dispose()
if($w -ne $h){ throw ('NON CARRE : '+$w+'x'+$h) }
'SOURCE : '+$src
'  '+$w+'x'+$h+'  '+( $bytes.Length )+' B'

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'
$iconsDir=Join-Path $www 'app\icons'
if(-not(Test-Path -LiteralPath $iconsDir)){ New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null }

# --- 2) copie de l'image serveur ---
$destPng=Join-Path $www 'app\icons\logo-app.png'
Copy-Item -LiteralPath $src -Destination $destPng -Force
$destPng2=Join-Path $www 'app\icons\logo.png'
Copy-Item -LiteralPath $src -Destination $destPng2 -Force
'LIcône copiee : logo-app.png + logo.png'

# --- 3) remplacement du sprite i-logo dans index.html (header + footer via use) ---
$idx=Join-Path $www 'index.html'
$c=[IO.File]::ReadAllText($idx)
$newSymbol='<symbol id="i-logo" viewBox="0 0 100 100"><image x="2" y="2" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="app/icons/logo-app.png" xlink:href="app/icons/logo-app.png"/></symbol>'

$st=$c.IndexOf('<symbol id="i-logo"')
$en=$c.IndexOf('</symbol>',$st)+9
if($st -lt 0 -or $en -lt 9){ throw 'sprite i-logo non trouve dans index.html' }
$c=$c.Substring(0,$st)+$newSymbol+$c.Substring($en)
[IO.File]::WriteAllText($idx,$c,(New-Object System.Text.UTF8Encoding($false)))
'index.html : sprite i-logo remplace (header + footer via use)'

# --- 4) remplacement des logos inline (header nav-logo) dans les autres pages www ---
$pages=@('contact.html','conditions.html','confidentialite.html','offline.html','pieces.html','professionnels.html','solutions.html','equipement.html')
$r=New-Object System.Text.RegularExpressions.Regex('<svg viewBox="0 0 100 100"([^>]*)>.*?</svg>',[System.Text.RegularExpressions.RegexOptions]::Singleline)
foreach($pg in $pages){
  $fp=Join-Path $www $pg
  if(-not(Test-Path -LiteralPath $fp)){ continue }
  $t=[IO.File]::ReadAllText($fp)
  $imgTag='<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:28px;height:28px;border-radius:8px">'
  $new=[regex]::Replace($t,$r,[System.Text.RegularExpressions.MatchEvaluator]{ param($m)
    if($m.Value -match 'class="nav-logo"|aria-label="C-AUTO|class="nav-logo"'){ return $imgTag }
    return $m.Value
  },1)
  [IO.File]::WriteAllText($fp,$new,(New-Object System.Text.UTF8Encoding($false)))
  "  $pg : header requete"
}
'--- fait ---'
