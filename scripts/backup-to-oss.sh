#!/bin/bash
set -euo pipefail

cd /opt/f7goods-website

BUCKET="f7goods-backup-1872964757915482"
PREFIX="f7goods/daily"
STAMP=$(date +%Y%m%d-%H%M%S)
WORK="/root/f7goods-oss-staging"
FILE="$WORK/f7goods-$STAMP.tar.gz"

mkdir -p "$WORK"

exec 9>/run/f7goods-oss-backup.lock
flock -n 9 || exit 0

# Remove staging files older than 2 days (failed uploads only).
find "$WORK" -name 'f7goods-*.tar.gz' -mtime +2 -delete 2>/dev/null || true

tar --exclude='uploads/.cache' -czf "$FILE" data uploads
tar -tzf "$FILE" >/dev/null

/usr/local/bin/ossutil cp -f "$FILE" "oss://$BUCKET/$PREFIX/" -c /root/.ossutilconfig

BASE=$(basename "$FILE")
COUNT=$(/usr/local/bin/ossutil ls "oss://$BUCKET/$PREFIX/" -c /root/.ossutilconfig 2>/dev/null | grep -c "$BASE" || true)
if [ "$COUNT" -lt 1 ]; then
  echo "$(date '+%F %T') upload verification failed: $BASE"
  exit 1
fi

rm -f "$FILE"
echo "$(date '+%F %T') uploaded $BASE"
