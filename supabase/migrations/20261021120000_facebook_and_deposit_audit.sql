-- NOT applied to production by this change.
-- Live accounts stay in public.fweta_app_store (the JSON document).
-- Run this only if relational sync is turned on later.
--
-- Facebook was not in the original social_platform enum. The app now
-- accepts facebook on profiles, campaigns, and submissions. A relational
-- cast of that value fails until the enum includes it.
-- Deposit confirmation (bank reference, confirming admin, time) is stored
-- on the JSON deposit object. These columns mirror that audit trail.

alter type public.social_platform add value if not exists 'facebook';

alter table public.fweta_brand_deposits
  add column if not exists bank_reference text,
  add column if not exists confirmed_by uuid,
  add column if not exists confirmed_at timestamptz;

-- Bio-code verification lives on the profile JSON document.
-- This column mirrors it for a later relational sync. Do not apply to production from this PR.
alter table public.fweta_profiles
  add column if not exists verification jsonb;
