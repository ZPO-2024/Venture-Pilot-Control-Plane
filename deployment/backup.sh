#!/usr/bin/env bash
# Dumps the control plane's Postgres database to deployment/backups/.
# Usage: deployment/backup.sh [label]
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Only fall back to .env when the caller hasn't already set DATABASE_URL --
# an explicit override (e.g. `DATABASE_URL=... deployment/backup.sh`) must
# always win, never be silently clobbered by .env.
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is not set (check .env or export it before running this script)}"

LABEL="${1:-manual}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="deployment/backups"
OUT_FILE="${OUT_DIR}/${TIMESTAMP}-${LABEL}.dump"

mkdir -p "$OUT_DIR"

# pg_dump/pg_restore don't understand Prisma's ?schema=... query param.
DB_URL_NO_QUERY="${DATABASE_URL%%\?*}"

echo "Backing up ${DB_URL_NO_QUERY} -> ${OUT_FILE}"
pg_dump --format=custom --no-owner --no-privileges --file="$OUT_FILE" "$DB_URL_NO_QUERY"

echo "Done: ${OUT_FILE} ($(du -h "$OUT_FILE" | cut -f1))"
