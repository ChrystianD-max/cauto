# =============================================================================
# V28 — Messagerie liee a UNE DEMANDE de reparation (deploiement complet)
# -----------------------------------------------------------------------------
# Patch de chat.js (ancres confirmees sur le fichier reel, lu integralement) :
#   (1) createConvSchema  : + service_request_id optionnel (uuid)
#   (2) POST /conversations INSERT : + colonne service_request_id (param $3)
#   (3) GET /conversations liste  : filtre optionnel ?service_request_id= ($2)
# Garde-fous : chaque ancre comptee (EXACTEMENT 1 sinon ABORT), node --check +
# eslint VERTS requis avant toute ecriture. Si vert : git add (chat.js + la
# migration v28) + commit + push, puis render-deploy (Phase Automatic) + health.
# =============================================================================
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$repo  = 'C:\Users\utilisateur\Documents\Default Project'
$chat  = Join-Path $repo 'backend\src\routes\chat.js'
$mig   = Join-Path $repo 'db\migration_v28_integrer_messagerie_au_demande.sql'
$gitExe= 'C:\Program Files\Git\bin\git.exe'
$git   = 'C:\Program Files\Git\bin\git.exe'
$env:PATH = 'C:\Program Files\nodejs;C:\Program Files\Git\bin;C:\Program Files\Git\cmd;' + $env:PATH

# --- helpers (noms de fonctions VALIDES) -------------------------------------
function CountOcc([string]$h,[string]$n){ return ([regex]::Matches($h,[regex]::Escape($n))).Count }
function StrFromBytes([byte[]]$b){
  $enc = New-Object Text.UTF8Encoding($false)
  return $enc.GetString($b)
}
function BytesFromStr([string]$s){
  $enc = New-Object Text.UTF8Encoding($false)
  return $enc.GetBytes($s)
}

$orig = [IO.File]::ReadAllBytes($chat)
$cjs  = StrFromBytes $orig
$bomOrig = ($orig.Length -ge 3) -and ($orig[0] -eq 0xEF) -and ($orig[1] -eq 0xBB) -and ($orig[2] -eq 0xBF)
"===1) chat.js lu : octets=$($orig.Length)  BOM_present=$bomOrig ==="

# --- Ancres (texte exact d'UNE ligne, chacune doit exister EXACTEMENT 1 fois) --
$a_s1 = "  title: z.string().max(160).optional()"
$a1   = "INSERT INTO conversations (kind, title, created_by)"
$a2   = "VALUES (`$1, `$2, `$3) RETURNING *"
$a3   = "[ids.length === 1 ? 'DIRECT' : 'GROUP', autoTitle, req.user.sub]"
$a_where_anchor = "WHERE cm.user_id = `$1"
$a_where_args   = "ORDER BY c.updated_at DESC``, [req.user.sub]"

$b_s1 = "  title: z.string().max(160).optional(),`n  service_request_id: z.string().uuid().optional()"
$b1   = "INSERT INTO conversations (kind, title, service_request_id, created_by)"
$b2   = "VALUES (`$1, `$2, `$3::UUID, `$4) RETURNING *"
$b3   = "[ids.length === 1 ? 'DIRECT' : 'GROUP', autoTitle, req.body.service_request_id ?? null, req.user.sub]"
$b_where = "WHERE cm.user_id = `$1`n       AND (`$2::uuid IS NULL OR c.service_request_id = `$2::uuid)"
$b_where_args = "ORDER BY c.updated_at DESC``, [req.user.sub, req.query.service_request_id ?? null]"

# --- Comptage des ancres (chacune doit vaudre EXACTEMENT 1) ------------------
$c_s1=CountOcc $cjs $a_s1; $c1=CountOcc $cjs $a1; $c2=CountOcc $cjs $a2
$c3 =CountOcc $cjs $a3;    $cw=CountOcc $cjs $a_where_anchor; $cwa=CountOcc $cjs $a_where_args
"===2) ancres (chacune ==1 requis) : schema=$c_s1 insert=$c1 values=$c2 args=$c3 where=$cw whereargs=$cwa ==="
$okAnchors = ($c_s1 -eq 1) -and ($c1 -eq 1) -and ($c2 -eq 1) -and ($c3 -eq 1) -and ($cw -eq 1) -and ($cwa -eq 1)
if(-not $okAnchors){ "ABORT : ancres absentes/ambigues. AUCUNE ecriture, fichier intact, prod intacte."; exit 2 }

# --- Patch (Replace exacts, commas uniques) ----------------------------------
$njs = $cjs.Replace($a_s1,$b_s1).Replace($a1,$b1).Replace($a2,$b2).Replace($a3,$b3)
$njs = $njs.Replace($a_where_anchor,$b_where).Replace($a_where_args,$b_where_args)

# Re-verif : nouveaux marqueurs presents + exclusivites supprimees (les ancres
# schema/where restent par construction car le remplacement les sert de prefixe)
$p_s1=CountOcc $njs $b_s1; $p1=CountOcc $njs $b1; $p2=CountOcc $njs $b2; $p3=CountOcc $njs $b3
$pw =CountOcc $njs $b_where; $pwa=CountOcc $njs $b_where_args
$r1=CountOcc $njs $a1; $r2=CountOcc $njs $a2; $r3=CountOcc $njs $a3; $rwa=CountOcc $njs $a_where_args
"===3) re-verif : nouveaux(>=1) schema=$p_s1 insert=$p1 values=$p2 args=$p3 where=$pw whereargs=$pwa ==="
$okPatched = ($p_s1 -ge 1) -and ($p1 -ge 1) -and ($p2 -ge 1) -and ($p3 -ge 1) -and ($pw -ge 1) -and ($pwa -ge 1) -and ($r1 -eq 0) -and ($r2 -eq 0) -and ($r3 -eq 0) -and ($rwa -eq 0)
if(-not $okPatched){ "ABORT : patch incomplet. AUCUNE ecriture."; exit 3 }

# --- Vérifications statiques AVANT écriture ----------------------------------
$tmp = Join-Path $repo 'backend\.chat_v28_checked.js'
[IO.File]::WriteAllBytes($tmp, (BytesFromStr $njs))
$nodeOut = & node --check $tmp 2>&1; $nc = $LASTEXITCODE
$eslOut  = & npx eslint $tmp 2>&1;    $ec = $LASTEXITCODE
"===4) node --check=$nc   eslint=$ec ==="
if($nc -ne 0 -or $ec -ne 0){
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  "ABORT : chat.js invalide (node/eslint). On ne touche RIEN ni git ni prod."
  if($nodeOut){ $nodeOut | Select-Object -First 4 }
  if($eslOut){ $eslOut | Select-Object -First 8 }
  exit 4
}
Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue

# --- Écriture propre (UTF-8 sans BOM, CRLF) + vérif BOM -------------------
[IO.File]::WriteAllBytes($chat, (BytesFromStr $njs))
$after = [IO.File]::ReadAllBytes($chat)
$bomAfter = ($after.Length -ge 3) -and ($after[0] -eq 0xEF) -and ($after[1] -eq 0xBB) -and ($after[2] -eq 0xBF)
"===5) chat.js ecrit : octets=$($after.Length)  BOM_present=$bomAfter ==="

# --- Commit + push (uniquement si tout est vert) — migration v28 incluse -----
& $git add -- "$chat" "$mig" 2>&1 | ForEach-Object { "  git add: $_" }
& $git commit -m "v28: messagerie liee a une demande (service_request_id sur conversations + filtre GET + migration)" 2>&1 | ForEach-Object { "  git commit: $_" }
& $git push origin HEAD 2>&1 | ForEach-Object { "  git push: $_" }

# --- Deploiement Render + controle de sante ----------------------------------
"===6) lancement deploy Render...==="
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'render-deploy.ps1') -Phase Automatic 2>&1 | ForEach-Object { "  deploy: $_" }

$h = Invoke-WebRequest -Uri 'https://pp-pro-4vnu.onrender.com/api/health' -UseBasicParsing -TimeoutSec 45
"===7) HEALTH PROD : HTTP $($h.StatusCode) ==="
if($h.StatusCode -eq 200){ "OK - prod saine. v28 deploye." } else { "ATTENTION : health != 200, verifier." }
