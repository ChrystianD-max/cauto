#!/usr/bin/env bash
# =============================================================================
# C-AUTO — démarrage du backend Node sur Serv00 (Passenger, sans Docker)
# -----------------------------------------------------------------------------
# 1. cd racine du dépôt, puis :  bash deploy/serv00/start.sh
# 2. La commande ci-dessous est aussi le "Startup File" renseigné dans le
#    panneau DevilWEB pour un site de type Node.js.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/../.."

rm -f backend/logs/api.log
mkdir -p backend/logs
touch backend/logs/api.log

cd backend
npm install --omit=dev --no-audit --no-fund
exec node src/server.js