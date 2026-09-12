$ErrorActionPreference='Stop'

$token = 'rnd_SamnOaQAblnWevO0dJF3nmDGnAhe'
$svc   = 'srv-dacmhkafngtc73e0ptsg'
$git   = 'C:\Users\utilisateur\Documents\Default Project'

$headers = @{ Authorization = ('Bearer ' + $token) }

$commit = (& git -C $git rev-parse HEAD).Trim()
'COMMIT CIBLE : ' + $commit

$body = @{ commit = $commit } | ConvertTo-Json -Compress
$deploy = Invoke-RestMethod -Method Post -Uri ('https://api.render.com/v1/services/' + $svc + '/deploys') -Headers $headers -ContentType 'application/json' -Body $body
$depId = $deploy.id
'DEPLOY CREE : ' + $depId

$deadline = (Get-Date).AddMinutes(6)
$status = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 15
  try {
    $d = Invoke-RestMethod -Method Get -Uri ('https://api.render.com/v1/services/' + $svc + '/deploys/' + $depId) -Headers $headers
    $status = $d.status
    $fini = if ($d.finishedAt) { '  fini=' + $d.finishedAt } else { '' }
    ('[{0:HH:mm:ss}] status={1}{2}' -f (Get-Date), $status, $fini)
    if ($status -in @('live','deactivated')) { break }
  } catch {
    '  poll mineur : ' + $_.Exception.Message
  }
}

'=== RESULTAT ==='
if ($status -eq 'live') {
  'LIVE OK - deploye et actif.'
  Start-Sleep -Seconds 8
  '=== verif serveur ==='
  foreach ($u in @('https://cauto.onrender.com/api/health')) {
    try {
      $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
      ('{0}  HTTP {1}  {2} B' -f $u, $resp.StatusCode, $resp.Content.Length)
      '  -> ' + $resp.Content
    } catch { '  ERREUR ' + $u + ' : ' + $_.Exception.Message }
  }
} else {
  'PAS LIVE - statut final : ' + $status
}
'FIN'