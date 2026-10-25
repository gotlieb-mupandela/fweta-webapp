-- Rollback for 20261026120100_revoke_unprefixed_client_grants.sql
--
-- The live grants on the unprefixed tables are not in the repo migrations,
-- so this file cannot invent them. Save them first with the read only
-- snapshot, from the repo root, BEFORE applying the forward file:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/ops/snapshot-client-grants.sql \
--     -o /tmp/fweta-client-grants.snapshot.sql
--
-- Replay that saved file through this rollback:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v snapshot=/tmp/fweta-client-grants.snapshot.sql \
--     -c 'begin' \
--     -f supabase/rollbacks/20261026120100_revoke_unprefixed_client_grants.down.sql \
--     -c 'commit'
--
-- The same snapshot is used for the file 1 and file 3 rollbacks.
-- If the psql variable snapshot is not set, the fallback below runs instead.
-- That fallback does not restore the live catalog.

\if :{?snapshot}
\echo 'Replaying client grant snapshot:' :snapshot
\ir :snapshot
\else

-- Re-granting these privileges re-opens the exposure. This file does not
-- grant them.
--
-- Derived from the migrations on main, not guessed: no migration grants
-- anon or authenticated any privilege on bookings, brand_deposits, campaigns,
-- fraud_flags, influencer_profiles, ledger_entries, payout_methods, profiles,
-- rate_cards, submissions, view_snapshots, wallets, or withdrawal_requests.
-- service_role was not revoked, so there is nothing to restore for that role.
--
-- David's live read, recorded here so the exposure is visible, and not
-- turned into GRANT statements: authenticated has INSERT, SELECT, and UPDATE
-- on the unprefixed tables, and DELETE on some of them. The live note did
-- not name which tables have DELETE, so a DELETE grant would be a guess.
-- anon has SELECT only on campaigns, influencer_profiles, and rate_cards.
-- Those grants are not in this repo.

do $unprefixed_down$
begin
  raise notice 'No anon or authenticated grants from repo migrations to restore on the unprefixed list.';
end
$unprefixed_down$;

\endif
