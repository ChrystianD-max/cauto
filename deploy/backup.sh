#!/usr/bin/env bash
# =============================================================================
# C-AUTO — Sauvegarde PostgreSQL (module 64)
# -----------------------------------------------------------------------------
# Une sauvegarde N'est PAS réputée réussie parce qu'un fichier existe.
# Ce script exit(≠0) dès que l'une de ces validations échoue :
#   1. le dump `pg_dump -Fc` (format custom compressé) est produit (non vide) ;
#   2. l'archive est LISIBLE : `pg_restore --list` la décode sans erreur ;
#   3. la carte (TOC) contient bien les tables critiques de l'application ;
#   4. une empreinte sha256 est émise (side-car `.sha256` joint au dump) ;
#   5. si stockage externe configuré : objet poussé PUIS revérifié
#      (HeadObject : taille + checksum SHA256 signé par le SDK).
#
# La restauration réelle fait l'objet d'un test dédié : ./deploy/restore-test.sh
#
# Usage : BACKUP_DIR=./backups ./deploy/backup.sh
# Cron conseillé (production) :  0 2 * * *  → rotation quotidienne,
#   hebdomadaire le dimanche, mensuelle le 1er du mois.
#
# Variables :
#   BACKUP_DIR              dossier local (défaut ./backups)
#   BACKUP_KEEP_DAILY / _WEEKLY / _MONTHLY   conservation historique locale
#   STORAGE_*               stockage externe S3-compatible (réutilise la
#                           config objet des modules 59/60)
#   BACKUP_REMOTE_KEEP      objets distants conservés (défaut 30)
#   BACKUP_NOTIFY_URL       webhook optionnel pingué succès / échec
# =============================================================================
set -euo pipefail
trap 'echo "[backup] ERREUR à la ligne $LINENO" >&2' ERR

TS=$(date +%Y%m%d_%H%M%S)
OUT_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$OUT_DIR"
PG_USER="${POSTGRES_USER:-cauto}"
PG_DB="${POSTGRES_DB:-cauto}"
KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-5}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-6}"
REMOTE_KEEP="${BACKUP_REMOTE_KEEP:-30}"

# --- Étiquetage de rotation ------------------------------------------------
DOM=$(date +%d)
DOW=$(date +%u)   # 1=lundi … 7=dimanche
if [ "$DOM" = "01" ]; then
  TAG=monthly
elif [ "$DOW" = "07" ]; then
  TAG=weekly
else
  TAG=daily
fi
case "$TAG" in
  daily)   KEEP=$KEEP_DAILY ;;
  weekly)  KEEP=$KEEP_WEEKLY ;;
  monthly) KEEP=$KEEP_MONTHLY ;;
esac

DUMP="$OUT_DIR/cauto_${TS}_${TAG}.dump"
SHA256_FILE="$DUMP.sha256"

echo "[backup] lancement : $PG_DB -> $DUMP (rotation: $TAG)"

# --- 1) Dump PostgreSQL -----------------------------------------------------
docker compose exec -T postgres pg_dump -Fc -U "$PG_USER" -d "$PG_DB" \
  --no-owner --no-privileges > "$DUMP"
if [ ! -s "$DUMP" ]; then
  echo "[backup] ECHEC : dump vide ($DUMP)" >&2
  exit 1
fi

# --- 2+3) Validation : archive lisible + présence tables critiques ----------
# Le dump est copié dans le conteneur postgres pour utiliser pg_restore.
PGRESTORE_TMP=/tmp/cauto_backup_validate.dump
docker compose cp "$DUMP" "postgres:$PGRESTORE_TMP" >/dev/null 2>&1 || {
  echo "[backup] ECHEC : docker compose cp indisponible" >&2
  exit 1
}
TOC=$(docker compose exec -T postgres pg_restore --list "$PGRESTORE_TMP" 2>&1)
docker compose exec -T postgres rm -f "$PGRESTORE_TMP" >/dev/null 2>&1 || true
if [ -z "$TOC" ]; then
  echo "[backup] ECHEC : archive illisible (pg_restore --list ne rend rien)" >&2
  exit 1
fi
for TBL in users vehicles garages professionals quotes diagnostics repair_orders payments; do
  if ! echo "$TOC" | grep 'TABLE' | awk '{print $6}' | grep -qx "$TBL"; then
    echo "[backup] ECHEC : table critique '$TBL' absente de l'archive" >&2
    exit 1
  fi
done
echo "[backup] validation archive : OK (lisible, tables critiques présentes)"

# --- 4) Empreinte sha256 (side-car) ----------------------------------------
SHA256=$(sha256sum "$DUMP" | awk '{print $1}')
printf '%s  %s\n' "$SHA256" "$(basename "$DUMP")" > "$SHA256_FILE"
echo "[backup] sha256 : $SHA256"

# --- Rotation locale (conservation historique) ------------------------------
prune() {
  local tag="$1" keep="$2"
  ls -1t "$OUT_DIR"/cauto_*_${tag}.dump 2>/dev/null | tail -n +$((keep + 1)) \
    | while read -r f; do
        [ -n "$f" ] || continue
        rm -f "$f" "${f}.sha256"
        echo "[backup] rotation : suppression $f"
      done
}
prune "$TAG" "$KEEP"

# --- 5) Stockage externe (S3-compatible) ------------------------------------
if [ "${STORAGE_MODE:-auto}" != "local" ] && [ -n "${STORAGE_BUCKET:-}" ] && [ -n "${STORAGE_ACCESS_KEY:-}" ]; then
  echo "[backup] stockage externe -> $STORAGE_BUCKET (préfixe ${STORAGE_PREFIX:-cauto}/backups/)"
  cat "$DUMP" | docker compose exec -T backend node scripts/upload-backup.js \
    "$(basename "$DUMP")" "$SHA256" "$REMOTE_KEEP"
  echo "[backup] objet distant vérifié : OK"
else
  echo "[backup] stockage externe : non configuré (S3) — fichiers locaux uniquement"
fi

SIZE=$(stat -c %s "$DUMP" 2>/dev/null || wc -c < "$DUMP")
echo "[backup] TERMINE OK : $(basename "$DUMP") (${SIZE} octets, sha256 $SHA256)"

if [ -n "${BACKUP_NOTIFY_URL:-}" ]; then
  curl -sf -X POST -H "Content-Type: application/json" \
    -d "{\"ok\":true,\"project\":\"cauto\",\"file\":\"$(basename "$DUMP")\",\"sha256\":\"$SHA256\"}" \
    "$BACKUP_NOTIFY_URL" >/dev/null 2>&1 || true
fi