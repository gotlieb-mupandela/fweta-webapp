-- Rollback for 20261026120100_revoke_unprefixed_client_grants.sql
--
-- This file does not invent grants. The live anon and authenticated
-- privileges on the unprefixed tables are not in the repo migrations.
-- David's live read stays a note, not a GRANT: authenticated has INSERT,
-- SELECT, and UPDATE on the unprefixed tables, and DELETE on some of them.
-- The note did not name which tables have DELETE. anon has SELECT only on
-- campaigns, influencer_profiles, and rate_cards.
--
-- Produce the snapshot with QA's export_acl.sql and gen_restore.py before
-- applying any forward file. Point the psql variable snapshot at that file.
-- Replaying any one of the three rollbacks with that snapshot restores the
-- grants for all three files, not only this one.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v snapshot=/tmp/fweta-client-grants.snapshot.sql \
--     -c 'begin' \
--     -f supabase/rollbacks/20261026120100_revoke_unprefixed_client_grants.down.sql \
--     -c 'commit'
--
-- If snapshot is not set, this file raises and grants nothing.
-- device_locations is not in the forward list and is not granted here.

\if :{?snapshot}
\echo 'Replaying client grant snapshot:' :snapshot
\echo 'One replay restores the grants for all three files.'
\ir :snapshot
\else
do $missing_snapshot$
begin
  raise exception 'Refusing to restore client grants without the psql variable snapshot. This rollback does not grant anything. Pass -v snapshot=/path/to/saved-acl.sql. One replay of that snapshot restores the grants for all three files.';
end
$missing_snapshot$;
\endif
