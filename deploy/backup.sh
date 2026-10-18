#!/usr/bin/env bash
# Daily backup: PostgreSQL dump + encrypted signing-key backup + checksums. See docs/RUNBOOK.md.
#   QPG_BACKUP_PASSPHRASE=... deploy/backup.sh [BACKUP_DIR]
# The passphrase must be stored apart from the backups. Copy BACKUP_DIR off the host afterwards.
set -euo pipefail
: "${QPG_BACKUP_PASSPHRASE:?set QPG_BACKUP_PASSPHRASE (stored apart from the backups)}"
BACKUP_DIR=${1:-${BACKUP_DIR:-./backups}}
COMPOSE=${COMPOSE:-docker compose --env-file deploy/.env}
ts=$(date -u +%Y%m%dT%H%M%SZ)
umask 077
mkdir -p "$BACKUP_DIR"

$COMPOSE exec -T postgres pg_dump -U qpg -d qpg --format=custom --no-owner > "$BACKUP_DIR/qpg-$ts.dump"
$COMPOSE exec -T -e QPG_BACKUP_PASSPHRASE api \
  python -m scripts.keys backup --key-file /data/signing_keys.json --out - > "$BACKUP_DIR/signing-key-$ts.qpgkey"

( cd "$BACKUP_DIR" && sha256sum "qpg-$ts.dump" "signing-key-$ts.qpgkey" > "MANIFEST-$ts.sha256" )
echo "backup written: $BACKUP_DIR/{qpg-$ts.dump,signing-key-$ts.qpgkey,MANIFEST-$ts.sha256}"
