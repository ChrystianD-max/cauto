$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

$www='C:\Users\utilisateur\Documents\Default Project\frontend\www'

# --- source : PNG fourni ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){
  $h=Get-ChildItem -Path 'C:\Users\utilisateur\OneDrive' -Filter 'file_00000000739881f4bee32c4acd4e89b7.png' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if($h){ $src=$h.FullName } else { throw 'PNG introuvable' }
}
$b=[IO.File]::ReadAllBytes($src)
if(-not($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)){ throw 'pas un PNG' }
$img=[System.Drawing.Image]::FromFile($src)
'SOURCE : '+$src+'  '+$img.Width+'x'+$img.Height
$img.Dispose()

$iconsDir=Join-Path $www 'app\icons'
$utf8=New-Object System.Text.UTF8Encoding($false)

# copie brute du PNG comme logo UI
Copy-Item -LiteralPath $src -Destination (Join-Path $iconsDir 'logo.png') -Force
Copy-Item -LiteralPath $src -Destination (Join-Path $iconsDir 'logo-app.png') -Force
'icone copiee : logo.png + logo-app.png'

$files=@(
 'index.html','contact.html','pieces.html','professionnels.html',
 'confidentialite.html','conditions.html','comment-ca-marche.html','aide.html',
 'entreprises.html','offline.html','app\index.html','app\aide.html','app\offline.html'
)
$imgSnippet='<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:1.2rem;height:1.2rem;border-radius:22%">'
$count=0
foreach($rel in $files){
  $p=Join-Path $www $rel
  if(-not(Test-Path -LiteralPath $p)){ continue }
  $t=[IO.File]::ReadAllText($p)
  $o=$t
  # 1) supprime le symbol i-logo inutile : transforme en rendu image simple
  $t=[regex]::Replace($t,'<symbol id="i-logo"[^>]*>.*?</symbol>','<image x="2" y="2" width="96" height="96" href="app/icons/logo-app.png" xlink:href="app/icons/logo-app.png" preserveAspectRatio="xMidYMid meet"/>',[Text.RegularExpressions.RegexOptions]::Singleline)
  # 2) chaque <use href="#i-logo"> / <use xlink:href="#i-logo"> -> img
  $t=[regex]::Replace($t,'<use\b[^>]*\bhref="[^"]*#i-logo"[^>]*/?\s*>','<img src="app/icons/logo-app.png" alt="C-AUTO" style="width:36px;height:36px;border-radius:22%">',[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  # 3) les logos inline rect/path car C-AUTO dans la nav : on garde (dessin) mais on ne les touche pas ici
  if($t -ne $o){
    [IO.File]::WriteAllText($p,$t,$utf8)
    $count++
    '  MAJ : '+$rel
  }
}
'--- utilisation i-logo restante ---'
gci -Path $www -Recurse -File -Include *.html,*.js -ErrorAction SilentlyContinue | Select-String -Pattern 'i-logo' -List | ForEach-Object { '  '+$_.Path.Replace($www+'\','') }
$count
