-- Rollback for 20261026120100_revoke_unprefixed_client_grants.sql
--
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
