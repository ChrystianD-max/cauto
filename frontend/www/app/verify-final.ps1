$ErrorActionPreference='Continue'
'=== VERIF FINALE C-AUTO (Render live) ==='

'--- 1) sw.js servi : version ---'
try {
  $u='https://cauto.onrender.com/app/sw.js'
  $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
  'HTTP '+$r.StatusCode+'  '+$r.Content.Length+' B'
  if($r.Content -match 'cauto-pwa-v\d+'){ 'VERSION SERVIE : '+$Matches[0] }
  else { 'PAS DE MARQUEUR VERSION !' }
} catch { 'sw : '+$_.Exception.Message }

'--- 2) logo 512 servi : dimensions reelles + signature ---'
try {
  $u='https://cauto.onrender.com/app/icons/icon-512.png'
  $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
  $b=$r.Content
  'HTTP '+$r.StatusCode+'  '+$b.Length+' B'
  $png=($b[0]-eq 0x89 -and $b[1]-eq 0x50 -and $b[2]-eq 0x4E -and $b[3]-eq 0x47)
  'PNG   : '+$png
  Add-Type -AssemblyName System.Drawing
  $ms=[IO.MemoryStream]::new($b)
  $im=[System.Drawing.Image]::FromStream($ms)
  'SERVI : '+$im.Width+'x'+$im.Height
  $im.Dispose();$ms.Dispose()
} catch { 'icon : '+$_.Exception.Message }

'--- 3) health API ---'
try {
  $r=Invoke-WebRequest -Uri 'https://cauto.onrender.com/api/health' -UseBasicParsing -TimeoutSec 30
  'HTTP '+$r.StatusCode+'  ->  '+$r.Content
} catch { 'health : '+$_.Exception.Message }

'=== FIN ==='