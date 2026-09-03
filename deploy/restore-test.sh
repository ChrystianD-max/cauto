#!/usr/bin/env bash
# =============================================================================
# C-AUTO — TEST DE RESTAURATION (module 64)
# -----------------------------------------------------------------------------
# Vérifie qu'une sauvegarde ne se contente pas "d'exister" : elle est
# réellement restaurée dans une base jetable et comparée à la base source.
#
#   Usage : ./deploy/restore-test.sh [fichier.dump]
#     (sans argument → dernière sauvegarde locale de BACKUP_DIR, défaut ./backups)
#
# Étapes :
#   1. intégrité du fichier : comparaison sha256 (side-car .sha256) ;
#   2. création d'une base jetable cauto_restore_test_<rand> ;
#   3. pg_restore réelle (--exit-on-error) dans cette base ;
#   4. comparaison des compteurs critiques (source vs restauré) ;
#   5. nettoyage de la base jetable.
#   Exit ≠ 0 si l'une des étapes échoue → restauration NON réputée OK.
# =============================================================================
set -euo pipefail

OUT_DIR="${BACKUP_DIR:-./backups}"
PG_USER="${POSTGRES_USER:-cauto}"
PG_DB="${POSTGRES_DB:-cauto}"
CRITICAL_TABLES="users vehicles garages professionals quotes diagnostics repair_orders payments"

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t "$OUT_DIR"/cauto_*.dump 2>/dev/null | head -n 1)"
fi
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "[restore-test] ECHEC : aucun fichier de sauvegarde trouvé ($OUT_DIR)" >&2
  exit 1
fi

echo "[restore-test] cible : $DUMP"

# --- 1) Intégrité : l'existence du fichier ne suffit pas ---------------------
if [ -f "$DUMP.sha256" ]; then
  expected=$(awk '{print $1}' "$DUMP.sha256")
  got=$(sha256sum "$DUMP" | awk '{print $1}')
  if [ -z "$expected" ] || [ "$got" != "$expected" ]; then
    echo "[restore-test] ECHEC : sha256 ne correspond pas (fichier corrompu/altéré)" >&2
    exit 1
  fi
  echo "[restore-test] sha256 : OK ($got)"
else
  echo "[restore-test] AVERTISSEMENT : pas de side-car .sha256 — pas de contrôle d'intégrité"
fi

# --- 2) Base jetable + 3) pg_restore ----------------------------------------
RANDOM_SUFFIX=$RANDOM$RANDOM
TESTDB="cauto_restore_test_${RANDOM_SUFFIX}"
PGRESTORE_TMP=/tmp/cauto_restore_test_${RANDOM_SUFFIX}.dump

echo "[restore-test] création base jetable : $TESTDB"
docker compose exec -T postgres createdb -U "$PG_USER" "$TESTDB"
cleanup() {
  docker compose exec -T postgres dropdb --if-exists -U "$PG_USER" "$TESTDB" >/dev/null 2>&1 || true
  docker compose exec -T postgres rm -f "$PGRESTORE_TMP" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[restore-test] copie du dump vers le conteneur postgres + pg_restore"
docker compose cp "$DUMP" "postgres:$PGRESTORE_TMP" >/dev/null 2>&1 || {
  echo "[restore-test] ECHEC : docker compose cp indisponible" >&2
  exit 1
}
docker compose exec -T postgres pg_restore -U "$PG_USER" -d "$TESTDB" \
  --no-owner --no-privileges --exit-on-error "$PGRESTORE_TMP" >/dev/null

echo "[restore-test] pg_restore : OK"

# --- 4) Comparaison compteurs (source vs restauré) ---------------------------
FAIL=0
for TBL in $CRITICAL_TABLES; do
  SRC=$(docker compose exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -tAc "SELECT count(*) FROM $TBL")
  DST=$(docker compose exec -T postgres psql -U "$PG_USER" -d "$TESTDB" -tAc "SELECT count(*) FROM $TBL" 2>/dev/null || echo EMPTY)
  if [ "$SRC" = "$DST" ]; then
    echo "[restore-test] $TBL : source=$SRC restauré=$DST ✔"
  else
    echo "[restore-test] ECHEC $TBL : source=$SRC restauré=$DST" >&2
    FAIL=1
  fi
done

if [ "$FAIL" = "1" ]; then
  echo "[restore-test] RESTAURATION ECHOUEE (compteurs incohérents)" >&2
  exit 1
fi

echo "[restore-test] RESTAURATION TESTEE : OK ($TESTDB restaurée puis supprimée)"