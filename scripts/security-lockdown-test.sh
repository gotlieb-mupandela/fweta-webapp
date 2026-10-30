#!/usr/bin/env bash
# Run scripts/security-lockdown-test.sql on a throwaway local Postgres database.
# Refuses hosted Supabase URLs. Drops the database when it finishes.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${DATABASE_URL:-}" == *supabase.co* || "${DATABASE_URL:-}" == *supabase.com* ]]; then
  echo "Refusing to run: DATABASE_URL points at a hosted Supabase database." >&2
  exit 1
fi

unset DATABASE_URL PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGDATABASE

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. The SQL file was not executed." >&2
  exit 2
fi

db="fweta_lockdown_$$"
socket="${PG_SOCKET:-/var/run/postgresql}"

psql_local() {
  sudo -u postgres psql -h "$socket" -p 5432 -v ON_ERROR_STOP=1 "$@"
}

cleanup() {
  sudo -u postgres psql -h "$socket" -p 5432 -v ON_ERROR_STOP=1 \
    -c "drop database if exists ${db};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql_local -c "drop database if exists ${db};"
psql_local -c "create database ${db};"
psql_local -d "$db" -f scripts/security-lockdown-test.sql
echo "security lockdown checks passed on local database ${db}"
