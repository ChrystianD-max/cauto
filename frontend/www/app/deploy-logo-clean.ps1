$ErrorActionPreference='Stop'

$token   = 'rnd_SamnOaQAblnWevO0dJF3nmDGnAhe'
$svc     = 'srv-dacmhkafngtc73e0ptsg'
$gitSrc  = 'C:\Users\utilisateur\Documents\Default Project'
$commit  = (& git -C $gitSrc rev-parse HEAD).Trim()
$headers = @{ Authorization = ('Bearer ' + $token) }

'=== DEPLOY sur commit : ' + $commit + ' ==='
$body  = @{ commit = $commit } | ConvertTo-Json -Compress
$d = Invoke-RestMethod -Method Post -Uri ('https://api.render.com/v1/services/' + $svc + '/deploys') `
     -Headers $headers -ContentType 'application/json' -Body $body
$dep = $d.id
'Deploy cree : ' + $dep

'=== POLL statut (max 6:30) ==='
$deadline = (Get-Date).AddMinutes(6.5)
$status = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 15
  try {
    $dd = Invoke-RestMethod -Method Get -Uri ('https://api.render.com/v1/services/' + $svc + '/deploys/' + $dep) -Headers $headers
    $status = $dd.status
    $extra = ''
    if ($dd.finishedAt) { $extra = '  fini=' + $dd.finishedAt }
    '[{0:HH:mm:ss}] status={1}{2}' -f (Get-Date), $status, $extra
    if ($status -eq 'live') { break }
    if ($status -in @('build_failed','deactivated','inactive')) { break }
  } catch {
    '  poll mineur : ' + $_.Exception.Message
  }
}

'=== RESULTAT ==='
if ($status -eq 'live') {
  'LIVE ✓ — deploye et actif en production.'
  Start-Sleep -Seconds 8
  '=== VERIF SANTE + contenu servi ==='
  foreach ($u in @('https://cauto.onrender.com/api/health')) {
    try {
      $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
      ('{0}  HTTP {1}  {2} B  ->  {3}' -f $u, $resp.StatusCode, $resp.Content.Length, $resp.Content)
    } catch { '  ERREUR ' + $u + ' : ' + $_.Exception.Message }
  }
} else {
  'PAS LIVE — statut final : ' + $status
}
'DONE'