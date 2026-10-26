-- Rollback for 20261026120000_revoke_client_table_grants.sql
--
-- This file does not invent grants. There is no fallback that grants
-- execute on fweta_json_store_set to public, anon, or authenticated.
--
-- Run this file only through scripts/ops/replay-client-grants.sh.
-- Copy the sha256 from the terminal when the snapshot is taken, keep
-- it outside the snapshot directory, and type it at restore. The
-- wrapper refuses a missing or bad digest, a missing file, a relative
-- path, and an empty file. It copies the snapshot to a private temp
-- file, checks that copy, and runs psql on that same copy. It does
-- not read a checksum file. A direct psql replay is not supported.
-- It runs whatever the file contains.
--
-- Supported snapshot source: scripts/ops/snapshot-client-grants.sql in
-- this repo. Run it before any forward file. That script includes the
-- global postgres function default privilege row. QA's gen_restore.py v3
-- is an alternative that now also restores that global row.
--
-- Put only the snapshot in a private directory. mktemp -d creates it.
-- chmod 700 keeps it private. sha256sum prints the digest. Copy that
-- hash from the terminal and keep it outside the snapshot directory,
-- for example in a password manager or a note. Do not write it beside
-- the snapshot. Type it as the wrapper argument.
--
--   snapdir=$(mktemp -d)
--   chmod 700 "$snapdir"
--   psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/ops/snapshot-client-grants.sql \
--     -o "$snapdir/client-grants.snapshot.sql"
--   sha256sum "$snapdir/client-grants.snapshot.sql"
--   scripts/ops/replay-client-grants.sh \
--     "$snapdir/client-grants.snapshot.sql" \
--     <paste-the-hash> \
--     supabase/rollbacks/20261026120000_revoke_client_table_grants.down.sql
--
-- One replay of that absolute snapshot restores the grants for all three
-- files, not only this one.
--
-- If snapshot is not set, this file raises and grants nothing.
--
-- device_locations stays out. The forward file leaves that fix commented,
-- and this file does not grant it. PR 28 must never be applied after File 1.

\if :{?snapshot}
\echo 'Replaying client grant snapshot:' :snapshot
\echo 'One replay restores the grants for all three files.'
\ir :snapshot
\else
do $missing_snapshot$
begin
  raise exception 'Refusing to restore client grants without the psql variable snapshot. This rollback does not grant execute on fweta_json_store_set to public, anon, or authenticated. Run only through scripts/ops/replay-client-grants.sh and pass the sha256 recorded when the snapshot was taken. One replay of that snapshot restores the grants for all three files.';
end
$missing_snapshot$;
\endif
