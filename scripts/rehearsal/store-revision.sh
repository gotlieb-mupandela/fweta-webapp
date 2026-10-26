#!/usr/bin/env bash
# Rehearse the split fweta_app_store revision migrations on local PostgreSQL 16.
#
# Usage:
#   scripts/rehearsal/store-revision.sh
#
# Optional:
#   FWETA_REHEARSAL_DB     database name, must match ^fweta_rehearsal_[a-z0-9_]+$
#   FWETA_REHEARSAL_CAS_N  parallel compare-and-swap workers, integer 2 through 32
#
# The script drops and recreates only that database. It connects with the local
# peer socket as the postgres user. It does not read DATABASE_URL.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_DIR="${ROOT}/scripts/rehearsal/sql"
if [[ -f "${ROOT}/supabase/migrations/20261021165036_fweta_app_store_revision.sql" ]]; then
  echo "refusing to rehearse: 20261021165036_fweta_app_store_revision.sql is present" >&2
  echo "that file revokes table writes in the same step as the additive objects" >&2
  echo "live must never execute it; the additive and revoke files replace it" >&2
  exit 2
fi

DB_NAME="${FWETA_REHEARSAL_DB:-fweta_rehearsal_store_revision}"
N="${FWETA_REHEARSAL_CAS_N:-8}"
PASS=0

if [[ ! "${DB_NAME}" =~ ^fweta_rehearsal_[a-z0-9_]+$ ]]; then
  echo "refusing database name: ${DB_NAME}" >&2
  echo "rehearsal database names must match ^fweta_rehearsal_[a-z0-9_]+$" >&2
  exit 2
fi

case "${PGHOST:-}" in
  "" | local | localhost | 127.0.0.1 | ::1 | /var/run/postgresql) ;;
  *)
    echo "refusing PGHOST=${PGHOST}" >&2
    echo "rehearsal runs on the local PostgreSQL 16 socket only" >&2
    exit 2
    ;;
esac

if [[ ! "${N}" =~ ^[0-9]+$ ]] || [[ "${N}" -lt 2 ]] || [[ "${N}" -gt 32 ]]; then
  echo "FWETA_REHEARSAL_CAS_N must be an integer from 2 to 32" >&2
  exit 2
fi

if [[ -n "${DATABASE_URL:-}" || -n "${SUPABASE_DB_URL:-}" ]]; then
  echo "note: DATABASE_URL and SUPABASE_DB_URL are ignored. rehearsal uses the local peer socket only."
fi

unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE DATABASE_URL SUPABASE_DB_URL || true

if [[ "$(id -un)" == "postgres" ]]; then
  psql_cmd=(psql)
else
  if ! sudo -n -u postgres true 2>/dev/null; then
    echo "rehearsal needs passwordless local access as postgres (sudo -n -u postgres)" >&2
    exit 2
  fi
  psql_cmd=(sudo -n -u postgres psql)
fi

psql_maint() {
  "${psql_cmd[@]}" -d postgres -X -v ON_ERROR_STOP=1 -P pager=off "$@"
}

psql_at() {
  "${psql_cmd[@]}" -d "${DB_NAME}" -X -v ON_ERROR_STOP=1 -P pager=off -v "pass=${PASS}" "$@"
}

server_version="$(psql_maint -q -tA -c "show server_version_num")"
server_version="${server_version//$'\n'/}"
server_text="$(psql_maint -q -tA -c "show server_version")"
server_text="${server_text//$'\n'/}"

if [[ ! "${server_version}" =~ ^16[0-9]{4}$ ]]; then
  echo "refusing PostgreSQL ${server_text} (server_version_num=${server_version})" >&2
  echo "rehearsal requires local PostgreSQL 16" >&2
  exit 2
fi

echo "local PostgreSQL ${server_text}"
echo "database ${DB_NAME}"
echo "parallel cas workers ${N}"
echo "sha256 of files under test:"
sha256sum \
  "${ROOT}/supabase/migrations/20260829140000_fweta_app_store.sql" \
  "${ROOT}/supabase/migrations/20260830153000_fweta_app_store_grants.sql" \
  "${ROOT}/supabase/migrations/20261026130000_store_revision_additive.sql" \
  "${ROOT}/supabase/migrations/20261026140000_store_revision_revoke_writes.sql" \
  "${ROOT}/supabase/rollbacks/20261026130000_store_revision_additive_rollback.sql" \
  "${ROOT}/supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql"

echo "dropping and recreating local database ${DB_NAME}"
psql_maint -q -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB_NAME}' and pid <> pg_backend_pid();" >/dev/null
psql_maint -q -c "drop database if exists ${DB_NAME};"
psql_maint -q -c "create database ${DB_NAME};"

echo "creating roles and auth stub"
psql_at -f "${SQL_DIR}/01_roles_and_auth.sql"
echo "loading fweta_app_store migrations unchanged"
psql_at -f "${ROOT}/supabase/migrations/20260829140000_fweta_app_store.sql"
psql_at -f "${ROOT}/supabase/migrations/20260830153000_fweta_app_store_grants.sql"
echo "loading rehearsal helpers"
psql_at -f "${SQL_DIR}/02_helpers.sql"

run_concurrency() {
  local expected rev stored dir i ok conflict other code want
  expected="$(psql_at -q -tA -c "select revision from public.fweta_app_store where id = 'default'")"
  expected="${expected//$'\n'/}"
  if [[ ! "${expected}" =~ ^[0-9]+$ ]]; then
    echo "concurrency: revision is not an integer: [${expected}]" >&2
    exit 1
  fi

  dir="$(mktemp -d /tmp/fweta_rehearsal_cas.XXXXXX)"
  echo "concurrency pass ${PASS}: launching ${N} workers at revision ${expected} (output ${dir})"

  for i in $(seq 1 "${N}"); do
    (
      if psql_at \
        -v "worker_id=w${i}" \
        -v "expected_revision=${expected}" \
        -f "${SQL_DIR}/40_cas_worker.sql" \
        >"${dir}/w${i}.out" 2>&1; then
        echo 0 >"${dir}/w${i}.code"
      else
        echo $? >"${dir}/w${i}.code"
      fi
    ) &
  done
  wait

  ok=0
  conflict=0
  other=0
  for i in $(seq 1 "${N}"); do
    code="$(tr -d '[:space:]' <"${dir}/w${i}.code")"
    if [[ "${code}" == "0" ]] && grep -q "SUCCESS" "${dir}/w${i}.out"; then
      ok=$((ok + 1))
      echo "worker w${i} exit 0"
      cat "${dir}/w${i}.out"
    elif [[ "${code}" != "0" ]] && grep -q "40001" "${dir}/w${i}.out"; then
      conflict=$((conflict + 1))
      echo "worker w${i} exit ${code} conflict 40001"
    else
      other=$((other + 1))
      echo "----- worker w${i} unexpected exit ${code} -----"
      cat "${dir}/w${i}.out"
    fi
  done

  echo "concurrency pass ${PASS}: n=${N} success=${ok} conflict=${conflict} other=${other} expected_revision=${expected}"
  if [[ "${ok}" -ne 1 || "${conflict}" -ne $((N - 1)) || "${other}" -ne 0 ]]; then
    echo "concurrency assertion failed; output kept in ${dir}" >&2
    exit 1
  fi

  rev="$(psql_at -q -tA -c "select revision from public.fweta_app_store where id = 'default'")"
  rev="${rev//$'\n'/}"
  stored="$(psql_at -q -tA -c "select data->'profiles'->0->>'id' from public.fweta_app_store where id = 'default'")"
  stored="${stored//$'\n'/}"
  want=$((expected + 1))
  if [[ "${rev}" != "${want}" ]]; then
    echo "concurrency revision: got ${rev} want ${want}" >&2
    exit 1
  fi
  if [[ ! "${stored}" =~ ^w[0-9]+$ ]]; then
    echo "concurrency stored id unexpected: ${stored}" >&2
    exit 1
  fi
  echo "ok: pass ${PASS} concurrency one winner ${stored} revision ${rev}"
  rm -rf "${dir}"
}

for PASS in 1 2; do
  echo "========== pass ${PASS}: baseline =========="
  psql_at -f "${SQL_DIR}/10_baseline.sql"

  echo "========== pass ${PASS}: apply additive (twice) =========="
  psql_at -f "${ROOT}/supabase/migrations/20261026130000_store_revision_additive.sql"
  psql_at -f "${ROOT}/supabase/migrations/20261026130000_store_revision_additive.sql"
  psql_at -f "${SQL_DIR}/20_after_additive.sql"

  echo "========== pass ${PASS}: apply revoke (twice) =========="
  psql_at -f "${ROOT}/supabase/migrations/20261026140000_store_revision_revoke_writes.sql"
  psql_at -f "${ROOT}/supabase/migrations/20261026140000_store_revision_revoke_writes.sql"
  psql_at -f "${SQL_DIR}/30_after_revoke.sql"

  echo "========== pass ${PASS}: concurrency =========="
  run_concurrency

  echo "========== pass ${PASS}: roll back revoke (twice) =========="
  psql_at -f "${ROOT}/supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql"
  psql_at -f "${ROOT}/supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql"
  psql_at -f "${SQL_DIR}/50_after_rollback_revoke.sql"

  echo "========== pass ${PASS}: roll back additive (twice) =========="
  psql_at -f "${ROOT}/supabase/rollbacks/20261026130000_store_revision_additive_rollback.sql"
  psql_at -f "${ROOT}/supabase/rollbacks/20261026130000_store_revision_additive_rollback.sql"
  psql_at -f "${SQL_DIR}/60_after_rollback_additive.sql"
done

cat <<'EOF'

differences from hosted Supabase
- Peer socket to this machine's PostgreSQL 16. Not the hosted pooler and not PostgREST.
- auth.role() and auth.uid() are stubs that read request.jwt.claims only. Hosted PostgREST sets that GUC from the API key. Older hosted builds also read request.jwt.claim.role and request.jwt.claim.sub. This stub does not.
- 20260829000000_init.sql is not loaded. It references auth.users, which is not created here.
- 20260913140000_avatars_bucket.sql is not loaded. There is no storage schema.
- Relational migrations are not loaded, including production hardening. Hardening would add its own revision column. The baseline matches a store that has the JSON table and service_role grants, and no revision column.
- Loaded unchanged: 20260829140000_fweta_app_store.sql and 20260830153000_fweta_app_store_grants.sql.
- anon, authenticated, service_role, and supabase_admin are created on this cluster if they are missing. postgres is created only if it is missing. service_role is created with BYPASSRLS, which hosted Supabase sets. An existing service_role without BYPASSRLS is not altered.
- USAGE on schema public is granted to anon and authenticated here. Hosted Supabase grants that by default. The two store migrations grant it only to service_role.
- The old upsert is SQL with the same columns the pre-CAS supabase-js client sends: id, data, updated_at, on conflict id. Error text is PostgreSQL's, not a PostgREST wrapper. The SQLSTATE values are the ones the functions raise.
- Files are applied as the local superuser postgres, which owns the objects. The hosted SQL editor runs as postgres, so security definer ownership matches that path. supabase_admin is created and is not used to apply the files.
- The revoke rollback restores the service_role table privilege set recorded before the revoke. On PostgreSQL 16 that set is DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE. On PostgreSQL 17 and newer it also includes MAINTAIN, and both the revoke and the rollback name that privilege. Each pass compares that set, and the ACLs of the fweta_ functions that existed before the revoke, after the rollback. The script runs the pair twice.
- 20261021165036_fweta_app_store_revision.sql is not in this repo and is not executed. Live must never run a copy. It revoked table writes in the same file as the additive objects. If live migration history has no row for that version, no repair is needed. If the version was recorded as applied, leave the record and do not run the SQL.
- Trigger fire on this PostgreSQL 16 did not require the writing role to hold EXECUTE on the bump function. The additive file revokes that execute privilege and the upsert still bumps revision. Re-check that on the project's major version before applying if it is not 16.
- fweta_json_store_set is not in the repo. The rehearsal creates a stand-in only after proving the revoke file succeeds while the function is absent, then proves execute is removed and that the rollback grants it back to service_role only. A hosted database may already have the real function.

REHEARSAL_OK
EOF
