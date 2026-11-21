#!/usr/bin/env bash
# Load a knowledge-base file into the server database.
#
#   Docker Compose:  ./scripts/restore_kb.sh kb/lineready-kb-20261122.dump
#   Kubernetes:      ./scripts/restore_kb.sh kb/lineready-kb-20261122.dump --k8s [namespace]
#
# Replaces the knowledge tables (AMOS, AVIATAR, manuals, embeddings, fleet). The server's own runtime data
# (briefs, reviews, audit trail, caches, packs) is left untouched: those objects are filtered out of the restore.
set -euo pipefail
FILE="${1:?usage: restore_kb.sh <file.dump> [--k8s [namespace]]}"
[[ -f "$FILE.sha256" ]] && sha256sum -c "$FILE.sha256"
KEEP="brief feedback audit_event llm_cache ask_session coach_attempt logbook_check aircraft_pack"
LIST=$(mktemp)
# Run this on the machine that holds the .dump file (your laptop), with kubectl or docker access to the server.

if [[ "${2:-}" == "--k8s" ]]; then
  NS="${3:-lineready}"
  POD=$(kubectl -n "$NS" get pod -l app.kubernetes.io/name=lineready-db -o jsonpath='{.items[0].metadata.name}')
  EXEC=(kubectl -n "$NS" exec -i "$POD" --)
else
  EXEC=(docker compose exec -T db)
fi

# The restore list is built locally; the dump itself is STREAMED into pg_restore, so the 185 MB file never
# lands on the 2 GB server. Runtime tables (briefs, reviews, audit, caches, packs) are filtered out.
command -v pg_restore >/dev/null && pg_restore -l "$FILE" > "$LIST" \
  || "${EXEC[@]}" pg_restore -l < "$FILE" > "$LIST"
RUNTIME_RE="public ($(echo $KEEP | tr ' ' '|'))( |_)|INDEX public pack_reg "
grep -v -E "$RUNTIME_RE" "$LIST" > "$LIST.f"
"${EXEC[@]}" sh -c "cat > /tmp/kb.list" < "$LIST.f"
echo "== streaming $(du -h "$FILE" | cut -f1) into the database"
"${EXEC[@]}" pg_restore -U lineready -d lineready --clean --if-exists --no-owner --no-privileges -L /tmp/kb.list < "$FILE"
# Release the write-ahead log produced by the bulk load (matters on a small disk).
"${EXEC[@]}" sh -c "rm -f /tmp/kb.list; psql -U lineready -d lineready -qc 'CHECKPOINT' && psql -U lineready -d lineready -qtAc 'SELECT pg_switch_wal()' >/dev/null && psql -U lineready -d lineready -qc 'CHECKPOINT'"
rm -f "$LIST" "$LIST.f"
echo "== restored. Runtime tables (if first install) are created by the API at start-up."
