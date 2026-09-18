
# =============================================================================
# PATCH CHAT.JS — Module 74/75 : messagerie LIEE A UNE DEMANDE (v28)
# -----------------------------------------------------------------------------
# Objectif : une conversation (messagerie) doit pouvoir etre rattachee a UNE
# demande de reparation (service_request). Deux ancres a patcher :
#   (1) POST /conversations  -> INSERT (kind, title, created_by) + service_request_id
#   (2) GET  /conversations  -> WHERE cm.user_id = $1 (+ filtre service_request_id)
# Garde-fou : on ne patche QUE si les ancres EXACTES sont presentes, sinon ABORT
# sans ecriture (fichier intact, prod intacte). Rien ne sort sans node --check
# + eslint verts.
# =============================================================================
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$repo  = 'C:\Users\utilisateur\Documents\Default Project'
$chat  = Join-Path $repo 'backend\src\routes\chat.js'
$gitExe= 'C:\Program Files\Git\bin\git.exe'
$env:PATH = 'C:\Program Files\nodejs;C:\Program Files\Git\bin;' + $env:PATH

# Lecture en UTF-8 sans BOM, en conservant la casse/retours exacts (aucun Replace ferme sur CRLF).
$c = [IO.File]::ReadAllText($chat)
$noBom = New-Object Text.UTF8Encoding($false)
function Has2($hay,$ndl){ return ([regex]::Matches($hay,[regex]::Escape($ndl))).Count }

# ---------------------------------------------------------------------------
# (A) POST /conversations : le INSERT actuel + les args
# ---------------------------------------------------------------------------
$a_insert = "INSERT INTO conversations (kind, title, created_by)"
$a_vals   = "VALUES (`$1::TEXT, `$2::TEXT, `$3::UUID)"
$a_args   = "[ids.length === 1 ? 'DIRECT' : 'GROUP', autoTitle, req.user.sub]"
$b_insert = "INSERT INTO conversations (kind, title, service_request_id, created_by)"
$b_vals   = "VALUES (`$1::TEXT, `$2::TEXT, `$3::UUID, `$4::UUID)"
$b_args   = "[ids.length === 1 ? 'DIRECT' : 'GROUP', autoTitle, req.body.service_request_id ?? null, req.user.sub]"

# Le GET filtre (liste) actuel : WHERE cm.user_id = $1
$g_where  = "WHERE cm.user_id = `$1"
$g_args   = "[req.user.sub]"
$g_whereN = "WHERE cm.user_id = `$1"
$g_argsN  = "[req.user.sub, req.query.service_request_id ?? null]"

"=== ancres (chacune >=1 requise) ==="
"  a_insert=$($a_insert_count)  a_vals=$(($c|helpers).Count)  a_args=$(($c|helpers).Count)"
