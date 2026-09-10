#!/bin/bash
# f7goods server deploy script
# Run on the server in the project directory: bash deploy.sh

set -euo pipefail
cd "$(dirname "$0")"

LOCK="/tmp/f7goods-deploy.lock"
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "Another deploy is running. Aborting."
  exit 1
fi

echo "=== f7goods deploy ==="

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="data.bak.$STAMP"

echo "[1/6] Backup data/ -> $BACKUP_DIR"
cp -a data "$BACKUP_DIR"

echo "[2/6] Pull code"
if ! git pull --rebase; then
  echo "git pull failed — aborting (data left at $BACKUP_DIR)"
  exit 1
fi

echo "[3/6] Install dependencies"
if command -v npm &> /dev/null; then
  npm ci --omit=dev
else
  echo "npm not found; skipping install"
fi

echo "[4/6] Init missing data files"
mkdir -p data tmp-uploads uploads logs
node init-data.js

echo "[5/6] Restart service"
if command -v pm2 &> /dev/null; then
  pm2 restart f7goods 2>/dev/null || pm2 start ecosystem.config.js
  echo "PM2 restarted"
else
  echo "pm2 not found — restart manually"
fi

echo "[6/6] Done. Backup kept at $BACKUP_DIR"
echo "=== deploy complete ==="
