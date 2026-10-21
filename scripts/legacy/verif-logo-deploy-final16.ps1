$ErrorActionPreference='Continue'
Add-Type -AssemblyName System.Security
$rep='C:\Users\utilisateur\Documents\Default Project'
Set-Location -LiteralPath $rep

'=== 1) git : le PNG est-il dans leHEAD local + pousse ok ? ==='
$h=git rev-parse HEAD
$o=git rev-parse origin/main
$r=git ls-tree -r --name-only $h | Select-String 'logo-app\.png'
'  HEAD        : '+$h.Substring(0,11)
'  origin/main : '+$o.Substring(0,11)
'  IDENTIQUE   : '+($h -eq $o)
'  PNG dans l arbre : '+[bool]$r

'=== 2) Render sert-il logo-app.png non-404 ? ==='
function Sha256Of([byte[]]$b){
  $s=[Security.Cryptography.SHA256]::Create()
  try{ ($s.ComputeHash($b) | ForEach-Object { $_.ToString('x2') }) -join '' } finally { $s.Dispose() }
}
$annule=0
$lastHash=''
for($i=1;$i -le 40 -and -not $annule;$i++){
  Start-Sleep -Seconds 8
  try{
    $resp=Invoke-WebRequest -Uri 'https://cauto.onrender.com/app/icons/logo-app.png' -UseBasicParsing -TimeoutSec 150
    if([int]$resp.StatusCode -eq 200){
      $annule=1
      $lastHash=Sha256Of $resp.Content
      '  ESSAI '+$i+' : HTTP 200  '+$resp.RawContentLength+' B  SHA='+$lastHash.Substring(0,16)
    } else { '  ESSAI '+$i+' : HTTP '+[int]$resp.StatusCode }
  } catch { '  ESSAI '+$i+' : 404/erreur (pas encore propage)' }
}
if(-not $annule){ '  ... toujours pas dispo apres 40 essais (5 min). Le 404 persiste' }

'=== 3) hash LOCAL identique au hash SERVI ? ==='
$localPath='C:\Users\utilisateur\Documents\Default Project\frontend\www\app\icons\logo-app.png'
if(Test-Path -LiteralPath $localPath){
  $localHash=Sha256Of ([IO.File]::ReadAllBytes($localPath))
  '  SHA local : '+$localHash.Substring(0,16)
  if($lastHash){ '  IDENTIQUE : '+($localHash -eq $lastHash) }
} else { '  !! logo-app.png ABSENT en local' }

'=== 4) index.html servi : quel logo reference-t-il ? ==='
try{
  $c=(Invoke-WebRequest -Uri 'https://cauto.onrender.com/index.html' -UseBasicParsing -TimeoutSec 150).Content
  '  contient logo-app.png : '+($c -match 'logo-app\.png')
  '  contient i-logo(ancien): '+($c -match 'i-logo')
} catch { '  erreur : '+$_.Exception.Message }
'FIN'