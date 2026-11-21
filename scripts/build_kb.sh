#!/usr/bin/env bash
# Build the LineReady knowledge base on a laptop / build machine and export ONE file for the server.
#
#   ./scripts/build_kb.sh            full build from the data pack (~20-30 min, CPU only), then export
#   ./scripts/build_kb.sh --export   export only (database already built)
#
# Needs: Docker, and the data pack folders "01 Core" and "02 Supplementary" next to this repo.
# Output: kb/lineready-kb-<date>.dump  (pg_dump custom format, compressed). Upload that file to the server.
# The raw data pack and manual archives never leave this machine.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose"
OUT_DIR=kb
mkdir -p "$OUT_DIR"

if [[ "${1:-}" != "--export" ]]; then
  echo "== building images and starting the build database"
  $DC build app
  $DC up -d db
  $DC up -d app
  run() { $DC exec -T app python -m lineready.interfaces.cli "$@"; }
  echo "== parsing the data pack"
  run init
  run ingest wo stock tools faults pha tsm fleet amm ipc cases
  echo "== embeddings (local model, no data leaves this machine)"
  run ingest embed qembed
  echo "== synthetic demo shift (schedule/roster are not in the data pack)"
  run seed-shift
fi

echo "== trimming what the server never reads"
# Scheduled maintenance task cards (126k rows) are not used at runtime: only pilot/maintenance reports are.
$DC exec -T db psql -U lineready -q -c "DELETE FROM work_order WHERE wo_type = 'Scheduled'"

STAMP=$(date +%Y%m%d)
FILE="$OUT_DIR/lineready-kb-$STAMP.dump"
echo "== exporting $FILE"
# Runtime tables (briefs, reviews, audit, caches) are the server's own data: schema only, no rows.
$DC exec -T db pg_dump -U lineready -d lineready -Fc -Z 9 --no-owner --no-privileges \
  --exclude-table-data=brief --exclude-table-data=feedback --exclude-table-data=audit_event \
  --exclude-table-data=llm_cache --exclude-table-data=ask_session --exclude-table-data=coach_attempt \
  --exclude-table-data=logbook_check --exclude-table-data=aircraft_pack > "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo "== done: $(du -h "$FILE" | cut -f1)  $FILE"
echo "   upload it together with $FILE.sha256, then run scripts/restore_kb.sh on the server (see deploy/README.md)"
