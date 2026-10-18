#!/usr/bin/env bash
# Restore a dump into a scratch database and prove it is usable: migrations at head, audit chain intact, receipts
# verify against the backed-up public key, row counts match the source (optional). Exits non-zero on any failure.
#
#   deploy/restore-test.sh <dump> <keys: key-backup .qpgkey or public key set .json> [source database URL]
#
# Needs PostgreSQL client tools (createdb, pg_restore, dropdb) and the backend's Python environment.
# Connection: standard PG* variables (PGHOST, PGPORT, PGUSER, PGPASSWORD) for a role that may create databases.
set -euo pipefail
dump=${1:?usage: restore-test.sh <dump> <keys> [source-url]}
keys=${2:?usage: restore-test.sh <dump> <keys> [source-url]}
source_url=${3:-}
here=$(cd "$(dirname "$0")" && pwd)
backend="$here/../backend"
python=${PYTHON:-python3}
scratch="qpg_restore_test_$(date -u +%s)"
url="postgresql+psycopg://${PGUSER:-postgres}${PGPASSWORD:+:$PGPASSWORD}@${PGHOST:-127.0.0.1}:${PGPORT:-5432}/$scratch"

ts=$(basename "$dump" .dump); ts=${ts#qpg-}
manifest="$(dirname "$dump")/MANIFEST-$ts.sha256"
if [ -f "$manifest" ]; then (cd "$(dirname "$dump")" && sha256sum -c "$(basename "$manifest")"); fi

cleanup() { dropdb --if-exists "$scratch" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== restoring $dump into $scratch"
createdb "$scratch"
pg_restore --no-owner --exit-on-error -d "$scratch" "$dump"

echo "== checking"
cd "$backend"
args=(--database-url "$url" --keys "$keys")
[ -n "$source_url" ] && args+=(--source-url "$source_url")
"$python" -m scripts.restore_check "${args[@]}"
echo "== restore test passed"
