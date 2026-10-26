#!/usr/bin/env bash
# Replay one saved client-grant snapshot through a rollback file.
# Run this instead of psql. The expected sha256 is an argument, recorded
# when the snapshot was taken. This script does not read a checksum file.
#
# The snapshot is copied to a private temp file before the digest is
# checked. psql replays that same copy, so the original cannot change
# between the check and the replay.
#
#   scripts/ops/replay-client-grants.sh \
#     /absolute/path/fweta-client-grants.snapshot.sql \
#     <recorded-sha256> \
#     [supabase/rollbacks/<file>.down.sql]
#
# DATABASE_URL must be set. The third argument defaults to the File 1
# rollback. One replay restores the grants for all three files.

set -euo pipefail

refuse() {
  echo "Refusing to replay client grants: $*" >&2
  exit 1
}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$script_dir/../.." && pwd)
default_rollback="$repo_root/supabase/rollbacks/20261026120000_revoke_client_table_grants.down.sql"

if [[ $# -lt 1 || $# -gt 3 ]]; then
  refuse "usage: scripts/ops/replay-client-grants.sh <absolute-snapshot> <sha256> [rollback.down.sql]"
fi

snapshot=$1
expected=${2:-}
rollback=${3:-$default_rollback}

if [[ -z "$expected" ]]; then
  refuse "sha256 argument is missing"
fi

if [[ ! "$expected" =~ ^[0-9a-fA-F]{64}$ ]]; then
  refuse "sha256 must be exactly 64 hex characters"
fi

if [[ "$snapshot" != /* ]]; then
  refuse "snapshot path must be absolute"
fi

if [[ ! -f "$snapshot" ]]; then
  refuse "snapshot file is missing: $snapshot"
fi

if [[ ! -s "$snapshot" ]]; then
  refuse "snapshot file is empty: $snapshot"
fi

if [[ "$rollback" != /* ]]; then
  rollback="$repo_root/$rollback"
fi

if [[ ! -f "$rollback" ]]; then
  refuse "rollback file is missing: $rollback"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  refuse "DATABASE_URL is not set"
fi

expected_lc=$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')
tmp=$(mktemp)
chmod 600 "$tmp"
trap 'rm -f "$tmp"' EXIT
cp -- "$snapshot" "$tmp"
chmod 600 "$tmp"

actual=$(sha256sum -- "$tmp" | awk 'NR==1 { print $1 }')
if [[ "$actual" != "$expected_lc" ]]; then
  refuse "snapshot sha256 does not match"
fi

psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v "snapshot=${tmp}" \
  -c 'begin' \
  -f "$rollback" \
  -c 'commit'
