#!/usr/bin/env bash
# =============================================================================
# C-AUTO — sauvegarde PostgreSQL quotidienne (Serv00, sans Docker)
# -----------------------------------------------------------------------------
# Cron conseillé :  0 2 * * *  bash ~/cauto/deploy/serv00/backup.sh
# Rotation : BACKUP_KEEP (défaut 7) dumps compressés conservés.
# Sortie ≠ 0 si le dump est vide ou illisible (pg_restore --list).
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/../.."
source_backup_env() { set -a; [ -f .env ] && . ./.env; set +a; }
source_backup_env

DATABASE_URL="${DATABASE_URL:-}"
[ -n "$DATABASE_URL" ] || { echo "[backup] ECHEC : DATABASE_URL absent" >&2; exit 1; }

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
KEEP="${BACKUP_KEEP:-7}"
TS=$(date +%Y%m%d_%H%M%S)
DUMP="$BACKUP_DIR/cauto_${TS}.dump"

mkdir -p "$BACKUP_DIR"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges > "$DUMP"

if [ ! -s "$DUMP" ]; then
  echo "[backup] ECHEC : dump vide" >&2
  rm -f "$DUMP"
  exit 1
fi

if ! pg_restore --list "$DUMP" >/dev/null 2>&1; then
  echo "[backup] ECHEC : archive illisible" >&2
  rm -f "$DUMP"
  exit 1
fi

ls -1t "$BACKUP_DIR"/cauto_*.dump 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r f; do
  [ -n "$f" ] || continue
  rm -f "$f"
  echo "[backup] rotation : suppression $f"
done

SIZE=$(wc -c < "$DUMP")
echo "[backup] TERMINE OK : $(basename "$DUMP") (${SIZE} octets)"