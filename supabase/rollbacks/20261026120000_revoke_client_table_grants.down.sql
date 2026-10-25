-- Rollback for 20261026120000_revoke_client_table_grants.sql
--
-- This file does not invent grants. There is no fallback that grants
-- execute on fweta_json_store_set to public, anon, or authenticated.
--
-- Produce the snapshot with QA's export_acl.sql and gen_restore.py before
-- applying any forward file. Point the psql variable snapshot at that file.
-- Replaying any one of the three rollbacks with that snapshot restores the
-- grants for all three files, not only this one.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v snapshot=/tmp/fweta-client-grants.snapshot.sql \
--     -c 'begin' \
--     -f supabase/rollbacks/20261026120000_revoke_client_table_grants.down.sql \
--     -c 'commit'
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
  raise exception 'Refusing to restore client grants without the psql variable snapshot. This rollback does not grant execute on fweta_json_store_set to public, anon, or authenticated. Pass -v snapshot=/path/to/saved-acl.sql. One replay of that snapshot restores the grants for all three files.';
end
$missing_snapshot$;
\endif
