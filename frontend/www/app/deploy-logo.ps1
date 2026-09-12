$ErrorActionPreference='Stop'
$token='rnd_SamnOaQAblnWevO0dJF3nmDGnAhe'
$svc='srv-dacmhkafngtc73e0ptsg'
$src='C:\Users\utilisateur\Documents\Default Project'

function Deploy-Once {
  param([string]$commitRef)
  $body = @{ commit = $commitRef } | ConvertTo-Json -Compress
  $hdr = @{ Authorization = ('Bearer ' + $token) }
  $d = Invoke-RestMethod -Method Post -Uri ('https://api.render.com/v1/services/' + $svc + '/deploys') -Headers $hdr -ContentType 'application/json' -Body $body
  $d.id
}

$headers = @{ Authorization = ('Bearer ' + $token) }
$deadline = (Get-Date).AddMinutes(2)
$ok = $false
$tentatives = 0
while (-not $ok) {
  $tentatives++
  try {
    $d = Invoke-RestMethod -Method Get -Uri ('https://api.render.com/v1/services/' + $svc) -Headers $headers
    'SERVICE : ' + $d.service.name + ' | autoDeploy=' + $d.autoDeploy + ' | branch=' + $d.branch
    $ok = $true
  } catch {
    if ((Get-Date) -gt $deadline) { throw 'Impossible de joindre ly;API Render : ' + $_.Exception.Message }
    Start-Sleep -Seconds 5
  }
}

'-- commit cible : SHA du push --'
& git -C $src rev-parse HEAD
$commit = (& git -C $src rev-parse HEAD).Trim()
'-- creation du deploy explicite sur ce commit --'
$depId = Deploy-Once $commit
'DEPLOY ID : ' + $depId
'-- poll jusqu a live (max 5 min) --'
$fin = (Get-Date).AddMinutes(5)
$status = ''
while ((Get-Date) -lt $fin) {
  Start-Sleep -Seconds 15
  try {
    $dd = Invoke-RestMethod -Method Get -Uri ('https://api.render.com/v1/services/' + $svc + '/deploys/' + $depId) -Headers $headers
    $status = $dd.status
    $tip = ''
    if ($dd.finishedAt) { $tip = '  fini=' + $dd.finishedAt }
    ('[{0:HH:mm:ss}] status = {1}{2}' -f (Get-Date), $status, $tip)
    if ($status -in @('live', 'deactivated')) { break }
    if ($status -notin @('created', 'build_in_progress', 'update_in_progress', 'pre_deploy', 'deploying')) { break }
  } catch {
    '  poll err (mineur) : ' + $_.Exception.Message
  }
}

'=== RESULTAT ==='
if ($status -eq 'live') {
  'LIVE OK — deploye et actif.'
  Start-Sleep -Seconds 6
  '--- verif contenu servi ---'
  foreach ($u in @('https://cauto.onrender.com/api/health')) {
    try {
      $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
      ('{0}  HTTP {1}  {2} B  ->  {3}' -f $u, $resp.StatusCode, $resp.Content.Length, $resp.Content)
    } catch { '  ERREUR ' + $u + ' : ' + $_.Exception.Message }
  }
} else {
  'PAS LIVE — statut final : ' + $status
}
'FIN'