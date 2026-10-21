$ErrorActionPreference='Stop'

# C-AUTO - deploiement Render.
# Le token API n'est JAMAIS stocke dans le depot : il est lu depuis
# l'environnement (variable RENDER_API_TOKEN) ou depuis un fichier local
# non versionne (render-token.local.txt). Aucune cle en dur ici.

$svc = 'srv-dacmhkafngtc73e0ptsg'
$git = Split-Path -Parent $MyInvocation.MyCommand.Path

$token = $env:RENDER_API_TOKEN
if (-not $token) {
  $local = Join-Path $git 'render-token.local.txt'
  if (Test-Path -LiteralPath $local) {
    $token = (Get-Content -LiteralPath $local -Raw).Trim()
  }
}
if (-not $token) {
  'ERREUR : token Render introuvable.'
  'Definissez la variable d''environnement RENDER_API_TOKEN,'
  'ou creez un fichier (non versionne) render-token.local.txt contenant le token.'
  'Token : Render Dashboard > Account Settings > API Keys.'
  exit 1
}

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
      $resp = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 60
      ('{0}  HTTP {1}  {2} B' -f $u, $resp.StatusCode, $resp.Content.Length)
      '  -> ' + $resp.Content
    } catch { '  ERREUR ' + $u + ' : ' + $_.Exception.Message }
  }
} else {
  'PAS LIVE - statut final : ' + $status
}
'FIN'
