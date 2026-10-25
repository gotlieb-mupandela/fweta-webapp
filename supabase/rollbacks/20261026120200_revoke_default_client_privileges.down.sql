-- Rollback for 20261026120200_revoke_default_client_privileges.sql
--
-- This file does not invent default privileges and does not put the
-- platform defaults back for postgres or for supabase_admin.
--
-- Produce the snapshot with QA's export_acl.sql and gen_restore.py before
-- applying any forward file. Point the psql variable snapshot at that file.
-- Replaying any one of the three rollbacks with that snapshot restores the
-- grants for all three files, not only this one. That includes the default
-- privileges the snapshot recorded.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v snapshot=/tmp/fweta-client-grants.snapshot.sql \
--     -c 'begin' \
--     -f supabase/rollbacks/20261026120200_revoke_default_client_privileges.down.sql \
--     -c 'commit'
--
-- If snapshot is not set, this file raises and grants nothing.

\if :{?snapshot}
\echo 'Replaying client grant snapshot:' :snapshot
\echo 'One replay restores the grants for all three files.'
\ir :snapshot
\else
do $missing_snapshot$
begin
  raise exception 'Refusing to restore client grants without the psql variable snapshot. This rollback does not grant default privileges. Pass -v snapshot=/path/to/saved-acl.sql. One replay of that snapshot restores the grants for all three files.';
end
$missing_snapshot$;
\endif
