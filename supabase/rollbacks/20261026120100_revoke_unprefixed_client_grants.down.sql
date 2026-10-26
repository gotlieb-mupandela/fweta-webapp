-- Rollback for 20261026120100_revoke_unprefixed_client_grants.sql
--
-- This file does not invent grants. The live anon and authenticated
-- privileges on the unprefixed tables are not in the repo migrations.
-- David's live read stays a note, not a GRANT: authenticated has INSERT,
-- SELECT, and UPDATE on the unprefixed tables, and DELETE on some of them.
-- The note did not name which tables have DELETE. anon has SELECT only on
-- campaigns, influencer_profiles, and rate_cards.
--
-- Supported snapshot source: scripts/ops/snapshot-client-grants.sql in
-- this repo. Run it before any forward file. That script includes the
-- global postgres function default privilege row. QA's gen_restore.py v3
-- is an alternative that now also restores that global row.
--
-- Save the output to an absolute path, then write a checksum beside it.
-- psql resolves \ir relative to supabase/rollbacks/, so a relative
-- snapshot path looks in that directory and does not find the file.
-- The replay runs whatever the file contains. Verify the checksum
-- before you replay.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/ops/snapshot-client-grants.sql \
--     -o /tmp/fweta-client-grants.snapshot.sql
--   sha256sum /tmp/fweta-client-grants.snapshot.sql \
--     > /tmp/fweta-client-grants.snapshot.sql.sha256
--
--   sha256sum -c /tmp/fweta-client-grants.snapshot.sql.sha256
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v snapshot=/tmp/fweta-client-grants.snapshot.sql \
--     -c 'begin' \
--     -f supabase/rollbacks/20261026120100_revoke_unprefixed_client_grants.down.sql \
--     -c 'commit'
--
-- One replay of that absolute snapshot restores the grants for all three
-- files, not only this one.
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
  raise exception 'Refusing to restore client grants without the psql variable snapshot. This rollback does not grant anything. Pass -v snapshot=/absolute/path/to/saved-acl.sql. A relative path is resolved from supabase/rollbacks/ and does not find the file. Verify the snapshot checksum with sha256sum -c before replay. One replay of that snapshot restores the grants for all three files.';
end
$missing_snapshot$;
\endif
