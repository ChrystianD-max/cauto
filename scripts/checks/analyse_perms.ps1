$ErrorActionPreference = 'SilentlyContinue'
$root = "C:\Users\utilisateur\Documents\Default Project"

Write-Output "=== 1) Le seed PRINCIPAL est-il backend/seed/seed.js ? (confirmer) ==="
$seedPath = Join-Path $root "backend\seed\seed.js"
if (Test-Path -LiteralPath $seedPath) { Write-Output "  OUI: $seedPath" } else { Write-Output "  NON trouvé ici" }

Write-Output ""
Write-Output "=== 2) Dans seed.js : la ligne qui INSERE dans role_permissions (la clé du problème) ==="
$ln = Get-Content -LiteralPath $seedPath -Encoding UTF8
for ($i = 0; $i -lt $ln.Count; $i++) {
  $t = $ln[$i].Trim()
  if ($t.Length -lt 3) { continue }
  $low = $t.ToLower()
  if ($low.Contains('role_permissions') -and -not $low.StartsWith('--') -and -not $low.StartsWith('//')) {
    Write-Output ("  L" + ($i + 1) + " : " + $t.Substring(0, [Math]::Min(160, $t.Length)))
  }
}

Write-Output ""
Write-Output "=== 3) Où seed.js déclare-t-il la MAP role -> permissions (l'objet qu'il boucle) ? ==="
for ($i = 0; $i -lt $ln.Count; $i++) {
  $t = $ln[$i]
  if ($t -match "registerPermission|ensurePermission|seedPermissions|rolePermissions|permissionMap|ROLE_PERMISSIONS|PERMISSIONS_BY_ROLE|grantPermission") {
    Write-Output ("  L" + ($i + 1) + " : " + $t.Trim().Substring(0, [Math]::Min(160, $t.Trim().Length)))
  }
}

Write-Output ""
Write-Output "=== 4) Est-ce que 'ADMIN' (non SUPER) a la permission users.roles.assign ? Cherche dans les seeds SQL ===="
$sqlFiles = Get-ChildItem -LiteralPath (Join-Path $root "backend") -Recurse -Include "*.sql" -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "node_modules" }
$sqlFiles | ForEach-Object {
  $f = $_
  $c = Get-Content -LiteralPath $f.FullName -Encoding UTF8
  for ($i = 0; $i -lt $c.Count; $i++) {
    $t = $c[$i]
    if ($t.Contains('users.roles.assign')) {
      $pre = ''
      for ($k = [Math]::Max(0, $i - 2); $k -lt $i; $k++) { $pre += ($c[$k].Trim() + ' ') }
      Write-Output ("  " + $f.Name + " L" + ($i + 1) + " | avant: " + $pre.Substring([Math]::Max(0, $pre.Length - 120)))
      Write-Output ("         -> " + $t.Trim().Substring(0, [Math]::Min(120, $t.Trim().Length)))
    }
  }
}
Write-Output ""
Write-Output "=== 5) LE rôle SUPER_ADMIN a-t-il bien la permission ? (peut-on la retirer de ADMIN sans casser la console) ==="
Write-Output "  (Si le seul INSERT de role_permissions est SUPER_ADMIN->users.roles.assign, on est tranquille)"
Write-Output ""
Write-Output "=== 6) Côté FRONTEND : la vue Utilisateurs décide-t-elle d'afficher le bouton selon isSuperAdmin() ? ==="
$va = Join-Path $root "frontend\www\app\views-admin.js"
$vaLn = Get-Content -LiteralPath $va -Encoding UTF8
for ($i = 0; $i -lt $vaLn.Count; $i++) {
  $t = $vaLn[$i].Trim()
  if ($t -match "isSuperAdmin|data-new-adm-toggle|viewAdminUsers|users.roles.assign|SUPER_ADMIN") {
    Write-Output ("  views-admin L" + ($i + 1) + " : " + $t.Substring(0, [Math]::Min(110, $t.Length)))
  }
} 
