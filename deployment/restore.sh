#!/usr/bin/env bash
# Restores a deployment/backup.sh dump into the database at DATABASE_URL.
# Usage: deployment/restore.sh <dump-file> [--force]
#
# THIS IS DESTRUCTIVE: it drops and recreates every object in the target
# database before restoring. Prompts for confirmation unless --force is
# passed (e.g. for scripted/CI use against a throwaway database).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Only fall back to .env when the caller hasn't already set DATABASE_URL --
# an explicit override (e.g. `DATABASE_URL=... deployment/restore.sh`) must
# always win, never be silently clobbered by .env. This matters a lot more
# here than in backup.sh: restore is destructive (--clean --if-exists).
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL is not set (check .env or export it before running this script)}"

DUMP_FILE="${1:-}"
FORCE="${2:-}"

if [ -z "$DUMP_FILE" ]; then
  echo "Usage: deployment/restore.sh <dump-file> [--force]" >&2
  exit 1
fi
if [ ! -f "$DUMP_FILE" ]; then
  echo "Dump file not found: $DUMP_FILE" >&2
  exit 1
fi

if [ "$FORCE" != "--force" ]; then
  echo "This will DROP and recreate every object in:"
  echo "  ${DATABASE_URL%%\?*}"
  echo "before restoring ${DUMP_FILE}."
  read -r -p "Type 'yes' to continue: " CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

# pg_dump/pg_restore don't understand Prisma's ?schema=... query param.
DB_URL_NO_QUERY="${DATABASE_URL%%\?*}"

echo "Restoring ${DUMP_FILE} -> ${DB_URL_NO_QUERY}"
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DB_URL_NO_QUERY" "$DUMP_FILE"

echo "Restore complete. You may want to run: pnpm db:generate"
