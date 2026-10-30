#!/usr/bin/env bash
# Refusals and one good replay for scripts/ops/replay-client-grants.sh.
# Run from the repo root:
#   bash supabase/tests/replay_client_grants.sh
# Uses its own database, then drops it.

set -euo pipefail

repo_root=$(cd "$(dirname "$0")/../.." && pwd)
wrapper="$repo_root/scripts/ops/replay-client-grants.sh"
psql_bin=/usr/bin/psql
db=fweta_replay_wrapper
database_url="postgresql:///${db}"
workdir=$(mktemp -d)
marker="$workdir/psql-ran"
stubdir="$workdir/bin"
good="$workdir/good.sql"
tampered="$workdir/tampered.sql"
empty="$workdir/empty.sql"
relative_name="fweta-relative-snapshot.sql"
passed=0

cleanup() {
  sudo -u postgres dropdb --if-exists "$db" >/dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap cleanup EXIT

mkdir -p "$stubdir"
chmod 755 "$workdir" "$stubdir"
cat > "$stubdir/psql" <<EOF
#!/bin/bash
echo ran >> "$marker"
exit 0
EOF
chmod 755 "$stubdir/psql"

sudo -u postgres dropdb --if-exists "$db" >/dev/null 2>&1 || true
sudo -u postgres createdb "$db"

psql_db() {
  sudo -u postgres "$psql_bin" -v ON_ERROR_STOP=1 -d "$db" "$@"
}

psql_db <<'SQL'
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$roles$;

create table public.fweta_replay_probe (id int primary key);
revoke all privileges on table public.fweta_replay_probe from public, anon, authenticated;
SQL

assert_unchanged() {
  psql_db <<'SQL'
do $unchanged$
begin
  if has_table_privilege('anon', 'public.fweta_replay_probe', 'SELECT')
     or has_table_privilege('anon', 'public.fweta_replay_probe', 'INSERT')
     or has_table_privilege('anon', 'public.fweta_replay_probe', 'UPDATE')
     or has_table_privilege('anon', 'public.fweta_replay_probe', 'DELETE')
     or has_table_privilege('authenticated', 'public.fweta_replay_probe', 'SELECT') then
    raise exception 'replay changed client privileges on fweta_replay_probe';
  end if;
end
$unchanged$;
SQL
}

assert_unchanged

printf '%s\n' 'grant select on table public.fweta_replay_probe to anon;' > "$good"
good_hash=$(sha256sum -- "$good" | awk 'NR==1 { print $1 }')
printf '%s\n' 'grant all privileges on table public.fweta_replay_probe to anon;' > "$tampered"
: > "$empty"
empty_hash=$(sha256sum -- "$empty" | awk 'NR==1 { print $1 }')
printf '%s\n' 'grant all privileges on table public.fweta_replay_probe to anon;' > "$workdir/$relative_name"
chmod a+r "$good" "$tampered" "$empty" "$workdir/$relative_name"

run_refuse() {
  local label=$1
  local expect=$2
  shift 2
  local status=0
  local output
  rm -f "$marker"
  set +e
  output=$(sudo -u postgres env \
    PATH="$stubdir:/usr/bin:/bin" \
    DATABASE_URL="$database_url" \
    "$wrapper" "$@" 2>&1)
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    echo "$label: wrapper exited 0" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi
  if [[ -f "$marker" ]]; then
    echo "$label: psql ran" >&2
    exit 1
  fi
  if [[ "$output" != *"$expect"* ]]; then
    echo "$label: expected refusal text: $expect" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi
  assert_unchanged
  passed=$((passed + 1))
  echo "ok $label"
}

run_refuse "tampered snapshot" "snapshot sha256 does not match" \
  "$tampered" "$good_hash"
run_refuse "missing hash" "sha256 argument is missing" \
  "$good"
run_refuse "bad-length hash" "sha256 must be exactly 64 hex characters" \
  "$good" "abcd"
run_refuse "missing file" "snapshot file is missing" \
  "$workdir/does-not-exist.sql" "$good_hash"
run_refuse "relative path" "snapshot path must be absolute" \
  "$relative_name" "$good_hash"
run_refuse "empty file" "snapshot file is empty" \
  "$empty" "$empty_hash"

passthru="$workdir/passthru"
mkdir -p "$passthru"
psql_log="$workdir/psql-args"
: > "$psql_log"
chmod 777 "$workdir" "$passthru"
chmod 666 "$psql_log"
cat > "$passthru/psql" <<EOF
#!/bin/bash
printf '%s\n' "\$*" >> "$psql_log"
exec /usr/bin/psql "\$@"
EOF
chmod 755 "$passthru/psql"

rm -f "$marker"
sudo -u postgres env \
  PATH="$passthru:/usr/bin:/bin" \
  DATABASE_URL="$database_url" \
  "$wrapper" "$good" "$good_hash" \
  "$repo_root/supabase/rollbacks/20261026120000_revoke_client_table_grants.down.sql"

if [[ -f "$marker" ]]; then
  echo "good snapshot used the psql stub" >&2
  exit 1
fi

if ! grep -qw -- '-X' "$psql_log"; then
  echo "wrapper did not pass -X to psql" >&2
  cat "$psql_log" >&2
  exit 1
fi
passed=$((passed + 1))
echo "ok wrapper passes -X"

psql_db <<'SQL'
do $restored$
begin
  if not has_table_privilege('anon', 'public.fweta_replay_probe', 'SELECT') then
    raise exception 'good snapshot did not restore anon select';
  end if;
  if has_table_privilege('anon', 'public.fweta_replay_probe', 'INSERT')
     or has_table_privilege('authenticated', 'public.fweta_replay_probe', 'SELECT') then
    raise exception 'good snapshot granted more than anon select';
  end if;
end
$restored$;
SQL

passed=$((passed + 1))
echo "ok good snapshot restores"
echo "passed $passed"
