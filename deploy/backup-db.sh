#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env.production ]; then
  echo "Missing .env.production" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env.production
set +a

mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="backups/hmw-${stamp}.sql.gz"

docker compose --env-file .env.production exec -T db \
  mariadb-dump -uroot -p"${MARIADB_ROOT_PASSWORD}" \
  --single-transaction --routines --triggers "${MARIADB_DATABASE}" \
  | gzip > "${out}"

echo "Wrote ${out}"
find backups -type f -name 'hmw-*.sql.gz' -mtime +14 -delete
