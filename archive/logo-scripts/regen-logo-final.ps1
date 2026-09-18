$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security

$base='C:\Users\utilisateur\Documents\Default Project'
$www=Join-Path $base 'frontend\www'
$app=Join-Path $www 'app'
$iconsDir=Join-Path $app 'icons'

# --- le fichier LOGO fourni par l'utilisateur (valide + carre 230x230, et verifie au disque) ---
$src='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $src)){ throw 'PNG logo introuvable : '+$src }

$png=[System.Drawing.Image]::FromFile($src)
'SOURCE : {0}x{1}  carre={2}  ({3} B)' -f $png.Width,$png.Height,($png.Width -eq $png.Height),((Get-Item -LiteralPath $src).Length)

function Save-Icon([int]$sz,[string]$name,[bool]$maskable){
  $bmp=[System.Drawing.Bitmap]::new($sz,$sz,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode='HighQuality'
  $g.InterpolationMode='HighQualityBicubic'
  $g.PixelOffsetMode='HighQuality'
  if($maskable){
    $pad=[int]($sz*0.10)
    $g.DrawImage($png,$pad,$pad,($sz-2*$pad),($sz-2*$pad))
  } else {
    $g.DrawImage($png,0,0,$sz,$sz)
  }
  $g.Dispose()
  $bmp.Save((Join-Path $iconsDir $name),[System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  '{0,-20} {1,3}x{1}' -f $name,$sz
}

'=== REGENERE TOUTES LES ICONES depuis le PNG fourni ==='
Save-Icon 512 'icon-512.png'            $false
Save-Icon 192 'icon-192.png'            $false
Save-Icon 144 'icon-144.png'            $false
Save-Icon 96  'icon-96.png'             $false
Save-Icon 72  'icon-72.png'             $false
Save-Icon 48  'icon-48.png'             $false
Save-Icon 32  'icon-32.png'             $false
Save-Icon 16  'icon-16.png'             $false
Save-Icon 180 'apple-touch-icon.png'    $false
Save-Icon 512 'maskable-512.png'        $true
$png.Dispose()

'--- verif System.Drawing (source de verite) ---'
foreach($n in @('icon-512.png','icon-192.png','maskable-512.png','apple-touch-icon.png')){
  $im=[System.Drawing.Image]::FromFile((Join-Path $iconsDir $n))
  '{0,-22} {1}x{1} PNG={2}' -f $n,$im.Width,($im.RawFormat.Guid -eq [System.Drawing.Imaging.ImageFormat]::Png.Guid)
  $im.Dispose()
}

'=== BUMP sw.js : force le re-cache chez les clients ==='
$sw=Join-Path $app 'sw.js'
$c=Get-Content -LiteralPath $sw -Raw
$m=[regex]::Match($c,'cauto-pwa-v(\d+)')
if($m.Success){
  $old=[int]$m.Groups[1].Value
  $new=$old+1
  $c2=$c.Replace($m.Value,'cauto-pwa-v'+$new)
  Set-Content -LiteralPath $sw -Value $c2 -Encoding UTF8 -NoNewline
  'sw.js : cauto-pwa-v{0} -> cauto-pwa-v{1}' -f $old,$new
} else { throw 'marqueur version sw introuvable' }

'=== COMMIT + PUSH ==='
git -C $base add -A
git -C $base commit -m 'LOGO C-AUTO definitif : toutes icones PWA regenerees depuis le PNG fourni par l utilisateur ; sw.js bump (force re-cache du nouveau logo)' | Out-Null
'commit OK : '+(git -C $base rev-parse HEAD).Substring(0,7)
git -C $base push origin main 2>&1 | Out-Null
'push OK'

'=== DEPLOY RENDER (services.svc) ==='
$svc='srv-dacmhkafngtc73e0ptsg'
$token='rnd_SamnOaQAblnWevO0dJF3nmDGnAhe'
$hdr=@{ Authorization=('Bearer '+$token) }
$commit2=(git -C $base rev-parse HEAD).Trim()
$body=@{ commit=$commit2 } | ConvertTo-Json -Compress
$dep=Invoke-RestMethod -Method Post -Uri ('https://api.render.com/v1/services/'+$svc+'/deploys') -Headers $hdr -ContentType 'application/json' -Body $body
'deploy id : '+$dep.id
$deadline=(Get-Date).AddMinutes(6)
$status=''
while((Get-Date) -lt $deadline){
  Start-Sleep -Seconds 15
  $d=Invoke-RestMethod -Method Get -Uri ('https://api.render.com/v1/services/'+$svc+'/deploys/'+$dep.id) -Headers $hdr
  '[{0:HH:mm:ss}] {1}' -f (Get-Date),$d.status
  $status=$d.status
  if($status -in @('live','deactivated')){ break }
}
'RESULTAT : '+$status

if($status -eq 'live'){
  Start-Sleep -Seconds 8
  '=== VERIF SANTE + logo servi ==='
  foreach($u in @('https://cauto.onrender.com/api/health')){
    try {
      $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
      ('{0}  HTTP {1}  ->  {2}' -f $u,$r.StatusCode,$r.Content)
    } catch { '  ERREUR '+$u+' : '+$_.Exception.Message }
  }
  '=== hash du icon-512 SERVI vs LOCAL ==='
  function Get-Hash([string]$p){
    $sha=[System.Security.Cryptography.SHA256]::Create()
    $h=$sha.ComputeHash([IO.File]::ReadAllBytes($p))
    $sha.Dispose()
    ($h | ForEach-Object { $_.ToString('x2') }) -join ''
  }
  $local=Get-Hash (Join-Path $iconsDir 'icon-512.png')
  'local  : '+$local.Substring(0,32)
  try {
    $r=Invoke-WebRequest -Uri 'https://cauto.onrender.com/app/icons/icon-512.png' -UseBasicParsing -TimeoutSec 40
    $served=Get-Hash $r.Content
    'servi  : '+$served.Substring(0,32)
    'IDENTIQUE : '+($local -eq $served)
  } catch { '  verif : '+$_.Exception.Message }
}
'FIN'