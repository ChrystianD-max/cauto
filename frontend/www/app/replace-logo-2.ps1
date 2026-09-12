$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

'=== ETAPE 1 : verifier que le PNG fourni est valide + carre ==='
$png='C:\Users\utilisateur\OneDrive\Pictures\file_00000000739881f4bee32c4acd4e89b7.png'
if(-not(Test-Path -LiteralPath $png)){ throw 'PNG fourni introuvable : '+$png }
$bytes=[IO.File]::ReadAllBytes($png)
$sig=($bytes[0]-eq 0x89 -and $bytes[1]-eq 0x50 -and $bytes[2]-eq 0x4E -and $bytes[3]-eq 0x47)
if(-not $sig){ throw 'NOT un PNG : '+$png }
$w=([int]$bytes[16]-shl 24)+([int]$bytes[17]-shl 16)+([int]$bytes[18]-shl 8)+$bytes[19]
$h=([int]$bytes[20]-shl 24)+([int]$bytes[21]-shl 16)+([int]$bytes[22]-shl 8)+$bytes[23]
'  PNG {0}x{1} carre={2}  ({3} B)' -f $w,$h,($w -eq $h),$bytes.Length
if($w -ne $h){ Write-Host '  attention : pas carre, on forcera le carre sur la zone 512' }

'=== ETAPE 2 : regenere TOUTES les icones + le logo header depuis CE png ==='
$iconsDir='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\icons'
$srcImg=[System.Drawing.Image]::FromFile($png)

function New-Icon([int]$size,[string]$outName){
  $bmp=[System.Drawing.Bitmap]::new($size,$size,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode='HighQuality'
  $g.InterpolationMode='HighQualityBicubic'
  $g.PixelOffsetMode='HighQuality'
  $g.DrawImage($srcImg,0,0,$size,$size)
  $g.Dispose()
  $bmp.Save((Join-Path $iconsDir $outName),[System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  '{0,-22} {1}x{1}' -f $outName,$size
}

New-Icon 512 'icon-512.png'
New-Icon 192 'icon-192.png'
New-Icon 144 'icon-144.png'
New-Icon 96  'icon-96.png'
New-Icon 72  'icon-72.png'
New-Icon 48  'icon-48.png'
New-Icon 32  'icon-32.png'
New-Icon 16  'icon-16.png'
New-Icon 180 'apple-touch-icon.png'

# maskable avec safe-zone 80%
$m=[System.Drawing.Bitmap]::new(512,512,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$mg=[System.Drawing.Graphics]::FromImage($m)
$mg.SmoothingMode='HighQuality'; $mg.InterpolationMode='HighQualityBicubic'; $mg.PixelOffsetMode='HighQuality'
$pad=[int](512*0.10)
$mg.DrawImage($srcImg,$pad,$pad,(512-2*$pad),(512-2*$pad))
$mg.Dispose()
$m.Save((Join-Path $iconsDir 'maskable-512.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$m.Dispose()
'maskable-512.png      512x512 (safe-zone 80%)'

# favicons
foreach($s in @(144,96,72,64,48,32,16)){ New-Icon $s ('favicon-'+$s+'.png') }
$srcImg.Dispose()

'=== ETAPE 3 : le HEADER affiche le logo ? (sprite SVG i-logo = logo C-AUTO casque) ==='
$vh='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\views-professionals-v8.js'
if(Test-Path -LiteralPath $vh){
  $c=Get-Content -LiteralPath $vh -Raw
  $hasLogo=$c.IndexOf('i-logo',[StringComparison]::OrdinalIgnoreCase) -ge 0
  '  views pro : i-logo present = '+$hasLogo
} else { '  views pro ABSENT : '+$vh }

'=== ETAPE 4 : bump sw.js v34 -> v35 (C LE GESTE QUI FORCE LE TEL A RECHARGER) ==='
$sw='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\sw.js'
$c=Get-Content -LiteralPath $sw -Raw
$m=[regex]::Match($c,"cauto-pwa-v(\d+)")
if($m.Success){
  $old=[int]$m.Groups[1].Value
  $new=$old+1
  $c2=$c.Replace($m.Value,('cauto-pwa-v'+$new))
  Set-Content -LiteralPath $sw -Value $c2 -Encoding UTF8 -NoNewline
  '  sw.js : cauto-pwa-v{0} -> cauto-pwa-v{1}' -f $old,$new
} else { throw 'marqueur version sw introuvable' }

'=== ETAPE 5 : commit + push + deploy Render ==='
$base='C:\Users\utilisateur\Documents\Default Project'
git -C $base add -A
git -C $base commit -m 'Logo C-AUTO (image fournie) : toutes icones PWA + favicons regenerees depuis le PNG utilisateur ; sw.js v35 (re-cache force)'
'  commit OK'
git -C $base push origin main 2>&1 | Out-Null
'  push OK'
$commit=(git -C $base rev-parse HEAD).Trim()
'  commit pousse : '+$commit

$svc='srv-dacmhkafngtc73e0ptsg'
$token='rnd_SamnOaQAblnWevO0dJF3nmDGnAhe'
$headers=@{ Authorization='Bearer '+$token }
try {
  $body=@{ commit=$commit } | ConvertTo-Json -Compress
  $d=Invoke-RestMethod -Method Post -Uri ('https://api.render.com/v1/services/'+$svc+'/deploys') -Headers $headers -ContentType 'application/json' -Body $body
  $dep=$d.id
  '  deploy Render lance : '+$dep
  $deadline=(Get-Date).AddMinutes(5)
  do {
    Start-Sleep -Seconds 12
    $dd=Invoke-RestMethod -Method Get -Uri ('https://api.render.com/v1/services/'+$svc+'/deploys/'+$dep) -Headers $headers
    '    status='+$dd.status
  } until ($dd.status -in @('live','deactivated','build_failed') -or (Get-Date) -gt $deadline)
  if($dd.status -eq 'live'){ '  DEPLOY LIVE OK' } else { '  deploy status final : '+$dd.status }
} catch { '  ERREUR deploy : '+$_.Exception.Message }

'=== ETAPE 6 : verification hash logo servi vs local ==='
Start-Sleep -Seconds 8
function Get-Sha256([string]$p){
  $sha=[System.Security.Cryptography.SHA256]::Create()
  try { ($sha.ComputeHash([IO.File]::ReadAllBytes($p)) | ForEach-Object { $_.ToString('x2') }) -join '' }
  finally { $sha.Dispose() }
}
$loc=Get-Sha256 (Join-Path $iconsDir 'icon-512.png')
'  local  icon-512 : '+$loc.Substring(0,32)+'...'
try {
  $r=Invoke-WebRequest -Uri 'https://cauto.onrender.com/app/icons/icon-512.png' -UseBasicParsing -TimeoutSec 40
  $served=[System.Security.Cryptography.SHA256]::Create(); $sb=$served.ComputeHash($r.Content); $served.Dispose()
  $srvHash=($sb | ForEach-Object { $_.ToString('x2') }) -join ''
  '  servi icon-512 : '+$srvHash.Substring(0,32)+'...'
  '  IDENTIQUE : '+($loc -eq $srvHash)
} catch { '  verif hash : '+$_.Exception.Message }
'FIN'