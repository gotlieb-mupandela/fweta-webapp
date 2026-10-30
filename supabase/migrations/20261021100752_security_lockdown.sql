-- Lock down store and wallet RPCs so only the service role can run them.
-- Rebased from PR 28 with a narrower scope. Do not apply this file from the
-- app, and do not apply it to a hosted database from this repo.
--
-- The Next.js server calls fweta_load_store and fweta_save_store only from
-- lib/db/supabase-store.ts, using SUPABASE_SECRET_KEY or
-- SUPABASE_SERVICE_ROLE_KEY. Cookie sessions decide who is a brand, clipper,
-- influencer, or admin. Admin wallet credits do not call adjust_wallet.
--
-- Kept:
--   public.fweta_assert_service_role()
--   fweta_load_store() and fweta_save_store(jsonb) call that gate
--   adjust_wallet, when already installed, allows only the service role
--   EXECUTE on those functions is revoked from PUBLIC, anon, and authenticated
--   and granted to service_role
--   default privileges no longer grant EXECUTE on future functions in public
--   to PUBLIC, anon, or authenticated
--   rls_auto_enable() loses EXECUTE for PUBLIC, anon, and authenticated when
--   that function exists
--   password_hash is not readable by PUBLIC, anon, or authenticated
--   RLS stays enabled on the fweta_* tables
--   fweta_app_store_no_user_access denies anon and authenticated
--
-- Removed versus PR 28:
--   every GRANT of SELECT, INSERT, UPDATE, or DELETE on fweta_* tables to
--   authenticated
--   the per-user policies that went with those grants, including
--   fweta_profiles_update (a user could change their own password_hash,
--   suspended flag, and email), fweta_withdrawal_requests_insert (no status,
--   amount, or wallet check), and brand deposit insert and update
--
-- 20261017160000_production_hardening.sql revokes all table privileges on the
-- 14 fweta_* tables from anon and authenticated, and it does not grant them
-- back. It also revokes EXECUTE on fweta_load_store and fweta_save_store from
-- PUBLIC, anon, and authenticated, and grants EXECUTE to service_role.
-- This file repeats those revokes. It also revokes column privileges, because
-- a table revoke does not clear a column grant, and it revokes from PUBLIC.
-- It does not grant any table privilege to anon, authenticated, service_role,
-- or PUBLIC. service_role table grants stay as earlier migrations left them,
-- including the later revoke of fweta_app_store writes in
-- 20261021165036_fweta_app_store_revision.sql when that file has already run.
-- The save function keeps the hardening guard that refuses an empty profile
-- list when rows already exist.
--
-- Live fweta_profiles columns on production (2026-10-21). The function bodies
-- below use only these names:
--   id, email, password_hash, display_name, bio, avatar_url, roles,
--   primary_role, notify_email, notify_withdrawals, notify_bookings,
--   suspended, created_at, updated_at.
--
-- Columns that exist only in main's migrations. Production does not have
-- them. Executable statements in this file do not name them:
--   20261017160000_production_hardening.sql and
--   20261020120000_profile_onboarding_columns.sql add first_name, last_name,
--   phone, company_name, website, niche, location, primary_platform, socials,
--   and onboarding_completed_at on fweta_profiles. Hardening also adds
--   credential_version.
--   20261017180000_platform_collections.sql adds onboarding, journey,
--   active_workspace_id, and kyc on fweta_profiles.
--   20261017190000_marketplace_growth.sql adds referral_code and referred_by
--   on fweta_profiles.
--   20261021120000_facebook_and_deposit_audit.sql (timestamp after this file)
--   adds fweta_profiles.verification and fweta_brand_deposits.bank_reference,
--   confirmed_by, and confirmed_at.
--   fweta_app_store.revision is added by the hardening file and again by
--   20261021165036_fweta_app_store_revision.sql (timestamp after this file).
-- niche, location, and socials on fweta_influencer_profiles are live columns
-- of that table. They are not the profile onboarding columns.

-- Store RPCs replace or return every account, including password hashes.
-- Only the service role (the Next.js server) may call them.
create or replace function public.fweta_assert_service_role()
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  raise exception 'fweta store RPCs are limited to the service role'
    using errcode = '42501';
end;
$$;

revoke all on function public.fweta_assert_service_role() from public, anon, authenticated;
grant execute on function public.fweta_assert_service_role() to service_role;


create or replace function public.fweta_load_store()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.fweta_assert_service_role();
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(to_jsonb(p) order by p."createdAt") from (
      select id, email, password_hash as "passwordHash", display_name as "displayName", bio,
        avatar_url as "avatarUrl", roles, primary_role as "primaryRole",
        notify_email as "notifyEmail", notify_withdrawals as "notifyWithdrawals",
        notify_bookings as "notifyBookings",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt",
        suspended
      from fweta_profiles
    ) p), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c."createdAt") from (
      select id, brand_id as "brandId", title, description, type, category, status,
        budget_total_cents as "budgetTotalCents", budget_spent_cents as "budgetSpentCents",
        cpm_cents as "cpmCents", max_payout_per_submission_cents as "maxPayoutPerSubmissionCents",
        platforms, requirements,
        case when end_date is null then null else to_char(end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "endDate",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_campaigns
    ) c), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s) order by s."createdAt") from (
      select id, campaign_id as "campaignId", clipper_id as "clipperId", post_url as "postUrl",
        platform, status, review_note as "reviewNote", views, earnings_cents as "earningsCents",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_submissions
    ) s), '[]'::jsonb),
    'viewSnapshots', coalesce((select jsonb_agg(to_jsonb(v) order by v."recordedAt") from (
      select id, submission_id as "submissionId", views,
        to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "recordedAt"
      from fweta_view_snapshots
    ) v), '[]'::jsonb),
    'wallets', coalesce((select jsonb_agg(to_jsonb(w)) from (
      select user_id as "userId", available_cents as "availableCents", pending_cents as "pendingCents",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_wallets
    ) w), '[]'::jsonb),
    'ledgerEntries', coalesce((select jsonb_agg(to_jsonb(l) order by l."createdAt") from (
      select id, user_id as "userId", amount_cents as "amountCents", type, reason,
        reference_type as "referenceType", reference_id as "referenceId",
        balance_after_available_cents as "balanceAfterAvailableCents",
        balance_after_pending_cents as "balanceAfterPendingCents",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
      from fweta_ledger_entries
    ) l), '[]'::jsonb),
    'payoutMethods', coalesce((select jsonb_agg(to_jsonb(p)) from (
      select id, user_id as "userId", bank_name as "bankName", branch_code as "branchCode",
        account_number_enc as "accountNumberEnc", account_holder_name as "accountHolderName",
        account_type as "accountType",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_payout_methods
    ) p), '[]'::jsonb),
    'withdrawalRequests', coalesce((select jsonb_agg(to_jsonb(w) order by w."createdAt") from (
      select id, user_id as "userId", payout_method_id as "payoutMethodId", amount_cents as "amountCents",
        status, bank_reference as "bankReference", admin_note as "adminNote",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt",
        case when paid_at is null then null else to_char(paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "paidAt"
      from fweta_withdrawal_requests
    ) w), '[]'::jsonb),
    'influencerProfiles', coalesce((select jsonb_agg(to_jsonb(i)) from (
      select id, user_id as "userId", slug, display_name as "displayName", headline, bio, niche, location,
        avatar_url as "avatarUrl", socials, featured_work as "featuredWork", published,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_influencer_profiles
    ) i), '[]'::jsonb),
    'rateCards', coalesce((select jsonb_agg(to_jsonb(r)) from (
      select id, influencer_profile_id as "influencerProfileId", title, description, type, platform,
        price_cents as "priceCents", active,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_rate_cards
    ) r), '[]'::jsonb),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) order by b."createdAt") from (
      select id, brand_id as "brandId", influencer_id as "influencerId",
        influencer_profile_id as "influencerProfileId", rate_card_item_id as "rateCardItemId",
        amount_cents as "amountCents", brief, deliverable_url as "deliverableUrl", status,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_bookings
    ) b), '[]'::jsonb),
    'brandDeposits', coalesce((select jsonb_agg(to_jsonb(d) order by d."createdAt") from (
      select id, brand_id as "brandId", amount_cents as "amountCents", note, status,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
      from fweta_brand_deposits
    ) d), '[]'::jsonb),
    'fraudFlags', coalesce((select jsonb_agg(to_jsonb(f) order by f."createdAt") from (
      select id, submission_id as "submissionId", reason, status,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        case when resolved_at is null then null else to_char(resolved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "resolvedAt"
      from fweta_fraud_flags
    ) f), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Save entire app store from JSON (atomic replace)
create or replace function public.fweta_save_store(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fweta_assert_service_role();
  -- Same guard as 20261017160000_production_hardening.sql.
  if jsonb_array_length(coalesce(payload->'profiles', '[]'::jsonb)) = 0
     and exists (select 1 from fweta_profiles) then
    raise exception 'refusing to replace a populated fweta store with empty profiles';
  end if;

  delete from fweta_fraud_flags;
  delete from fweta_view_snapshots;
  delete from fweta_brand_deposits;
  delete from fweta_bookings;
  delete from fweta_rate_cards;
  delete from fweta_influencer_profiles;
  delete from fweta_withdrawal_requests;
  delete from fweta_payout_methods;
  delete from fweta_ledger_entries;
  delete from fweta_wallets;
  delete from fweta_submissions;
  delete from fweta_campaigns;
  delete from fweta_profiles;

  insert into fweta_profiles (
    id, email, password_hash, display_name, bio, avatar_url, roles, primary_role,
    notify_email, notify_withdrawals, notify_bookings, suspended, created_at, updated_at
  )
  select
    (p->>'id')::uuid, p->>'email', p->>'passwordHash', p->>'displayName', coalesce(p->>'bio', ''),
    nullif(p->>'avatarUrl', ''), array(select jsonb_array_elements_text(p->'roles'))::user_role[],
    (p->>'primaryRole')::user_role,
    coalesce((p->>'notifyEmail')::boolean, true),
    coalesce((p->>'notifyWithdrawals')::boolean, true),
    coalesce((p->>'notifyBookings')::boolean, true),
    coalesce((p->>'suspended')::boolean, false),
    coalesce((p->>'createdAt')::timestamptz, now()),
    coalesce((p->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'profiles', '[]'::jsonb)) p;

  insert into fweta_campaigns
  select
    (c->>'id')::uuid, (c->>'brandId')::uuid, c->>'title', c->>'description',
    (c->>'type')::campaign_type, c->>'category', (c->>'status')::campaign_status,
    (c->>'budgetTotalCents')::integer, coalesce((c->>'budgetSpentCents')::integer, 0),
    (c->>'cpmCents')::integer, (c->>'maxPayoutPerSubmissionCents')::integer,
    array(select jsonb_array_elements_text(c->'platforms'))::social_platform[],
    coalesce(c->>'requirements', ''),
    nullif(c->>'endDate', '')::timestamptz,
    coalesce((c->>'createdAt')::timestamptz, now()),
    coalesce((c->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'campaigns', '[]'::jsonb)) c;

  insert into fweta_submissions
  select
    (s->>'id')::uuid, (s->>'campaignId')::uuid, (s->>'clipperId')::uuid,
    s->>'postUrl', (s->>'platform')::social_platform, (s->>'status')::submission_status,
    nullif(s->>'reviewNote', ''), coalesce((s->>'views')::integer, 0),
    coalesce((s->>'earningsCents')::integer, 0),
    coalesce((s->>'createdAt')::timestamptz, now()),
    coalesce((s->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'submissions', '[]'::jsonb)) s;

  insert into fweta_view_snapshots
  select
    (v->>'id')::uuid, (v->>'submissionId')::uuid, (v->>'views')::integer,
    coalesce((v->>'recordedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'viewSnapshots', '[]'::jsonb)) v;

  insert into fweta_wallets
  select
    (w->>'userId')::uuid, coalesce((w->>'availableCents')::integer, 0),
    coalesce((w->>'pendingCents')::integer, 0),
    coalesce((w->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'wallets', '[]'::jsonb)) w;

  insert into fweta_ledger_entries
  select
    (l->>'id')::uuid, (l->>'userId')::uuid, (l->>'amountCents')::integer, l->>'type',
    l->>'reason', l->>'referenceType', nullif(l->>'referenceId', '')::uuid,
    (l->>'balanceAfterAvailableCents')::integer, (l->>'balanceAfterPendingCents')::integer,
    coalesce((l->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'ledgerEntries', '[]'::jsonb)) l;

  insert into fweta_payout_methods
  select
    (p->>'id')::uuid, (p->>'userId')::uuid, p->>'bankName', p->>'branchCode',
    p->>'accountNumberEnc', p->>'accountHolderName', (p->>'accountType')::account_type,
    coalesce((p->>'createdAt')::timestamptz, now()),
    coalesce((p->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'payoutMethods', '[]'::jsonb)) p;

  insert into fweta_withdrawal_requests
  select
    (w->>'id')::uuid, (w->>'userId')::uuid, (w->>'payoutMethodId')::uuid,
    (w->>'amountCents')::integer, (w->>'status')::withdrawal_status,
    nullif(w->>'bankReference', ''), nullif(w->>'adminNote', ''),
    coalesce((w->>'createdAt')::timestamptz, now()),
    coalesce((w->>'updatedAt')::timestamptz, now()),
    nullif(w->>'paidAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'withdrawalRequests', '[]'::jsonb)) w;

  insert into fweta_influencer_profiles
  select
    (i->>'id')::uuid, (i->>'userId')::uuid, i->>'slug', i->>'displayName',
    coalesce(i->>'headline', ''), coalesce(i->>'bio', ''), coalesce(i->>'niche', ''),
    coalesce(i->>'location', ''), nullif(i->>'avatarUrl', ''),
    coalesce(i->'socials', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(i->'featuredWork')), '{}'::text[]),
    coalesce((i->>'published')::boolean, false),
    coalesce((i->>'createdAt')::timestamptz, now()),
    coalesce((i->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'influencerProfiles', '[]'::jsonb)) i;

  insert into fweta_rate_cards
  select
    (r->>'id')::uuid, (r->>'influencerProfileId')::uuid, r->>'title',
    coalesce(r->>'description', ''), r->>'type', r->>'platform',
    (r->>'priceCents')::integer, coalesce((r->>'active')::boolean, true),
    coalesce((r->>'createdAt')::timestamptz, now()),
    coalesce((r->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'rateCards', '[]'::jsonb)) r;

  insert into fweta_bookings
  select
    (b->>'id')::uuid, (b->>'brandId')::uuid, (b->>'influencerId')::uuid,
    (b->>'influencerProfileId')::uuid, (b->>'rateCardItemId')::uuid,
    (b->>'amountCents')::integer, coalesce(b->>'brief', ''),
    nullif(b->>'deliverableUrl', ''), (b->>'status')::booking_status,
    coalesce((b->>'createdAt')::timestamptz, now()),
    coalesce((b->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'bookings', '[]'::jsonb)) b;

  insert into fweta_brand_deposits
  select
    (d->>'id')::uuid, (d->>'brandId')::uuid, (d->>'amountCents')::integer,
    coalesce(d->>'note', ''), coalesce(d->>'status', 'credited'),
    coalesce((d->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'brandDeposits', '[]'::jsonb)) d;

  insert into fweta_fraud_flags
  select
    (f->>'id')::uuid, (f->>'submissionId')::uuid, f->>'reason',
    coalesce(f->>'status', 'open'),
    coalesce((f->>'createdAt')::timestamptz, now()),
    nullif(f->>'resolvedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'fraudFlags', '[]'::jsonb)) f;
end;
$$;


revoke all on function public.fweta_load_store() from public, anon, authenticated;
revoke all on function public.fweta_save_store(jsonb) from public, anon, authenticated;
grant execute on function public.fweta_load_store() to service_role;
grant execute on function public.fweta_save_store(jsonb) to service_role;

-- adjust_wallet lives on the Supabase Auth tables (public.wallets), not fweta_*.
-- It is not created by earlier files in this repo. When it is present, only the
-- service role may execute it. The body rejects every other JWT role, so a
-- later grant of EXECUTE still cannot credit a wallet.
do $lock$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'adjust_wallet'
  ) then
    raise notice 'adjust_wallet is not installed; skipping wallet RPC lockdown';
    return;
  end if;

  execute $fn$
create or replace function public.adjust_wallet(
  p_user_id uuid,
  p_available_delta integer,
  p_pending_delta integer,
  p_type public.ledger_entry_type,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fw$
declare
  wallet public.wallets%rowtype;
  amount integer;
  entry_id uuid;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'adjust_wallet is limited to the service role'
      using errcode = '42501';
  end if;

  amount := abs(p_available_delta);
  if amount = 0 then
    amount := abs(p_pending_delta);
  end if;
  if amount <= 0 then
    raise exception 'Ledger amount must be positive';
  end if;

  insert into public.wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if wallet.available_cents + p_available_delta < 0 then
    raise exception 'Insufficient available balance.';
  end if;
  if wallet.pending_cents + p_pending_delta < 0 then
    raise exception 'Insufficient pending balance.';
  end if;

  update public.wallets
  set
    available_cents = wallet.available_cents + p_available_delta,
    pending_cents = wallet.pending_cents + p_pending_delta,
    updated_at = now()
  where user_id = p_user_id
  returning * into wallet;

  insert into public.ledger_entries (
    user_id,
    amount_cents,
    type,
    reason,
    reference_type,
    reference_id,
    balance_after_available_cents,
    balance_after_pending_cents
  )
  values (
    p_user_id,
    amount,
    p_type,
    p_reason,
    p_reference_type,
    p_reference_id,
    wallet.available_cents,
    wallet.pending_cents
  )
  returning id into entry_id;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'userId', wallet.user_id,
      'availableCents', wallet.available_cents,
      'pendingCents', wallet.pending_cents,
      'updatedAt', wallet.updated_at
    ),
    'entry', jsonb_build_object(
      'id', entry_id,
      'userId', p_user_id,
      'amountCents', amount,
      'type', p_type,
      'reason', p_reason,
      'referenceType', p_reference_type,
      'referenceId', p_reference_id,
      'balanceAfterAvailableCents', wallet.available_cents,
      'balanceAfterPendingCents', wallet.pending_cents
    )
  );
end;
$fw$;
$fn$;

  execute 'revoke all on function public.adjust_wallet(uuid,integer,integer,public.ledger_entry_type,text,text,uuid) from public, anon, authenticated';
  execute 'grant execute on function public.adjust_wallet(uuid,integer,integer,public.ledger_entry_type,text,text,uuid) to service_role';
end
$lock$;

-- Platform event trigger. It is not an app RPC. Anon and signed-in users must not call it.
do $lock$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$lock$;

-- Stop new public functions from being executable by anon or signed-in users.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Clear table and column privileges for anon and authenticated.
-- Repeat the production hardening revokes. Also clear column grants so
-- password_hash cannot remain readable through a column-level SELECT.
-- Do not grant any of these privileges back, and do not change service_role
-- table grants.

do $lock$
declare
  col record;
begin
  for col in
    select c.table_name, c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name like 'fweta!_%' escape '!'
  loop
    execute format(
      'revoke all privileges (%I) on table public.%I from public, anon, authenticated',
      col.column_name,
      col.table_name
    );
  end loop;
end
$lock$;

revoke all on table
  public.fweta_app_store,
  public.fweta_profiles,
  public.fweta_campaigns,
  public.fweta_submissions,
  public.fweta_view_snapshots,
  public.fweta_wallets,
  public.fweta_ledger_entries,
  public.fweta_payout_methods,
  public.fweta_withdrawal_requests,
  public.fweta_influencer_profiles,
  public.fweta_rate_cards,
  public.fweta_bookings,
  public.fweta_brand_deposits,
  public.fweta_fraud_flags
from public, anon, authenticated;

alter table public.fweta_app_store enable row level security;
alter table public.fweta_profiles enable row level security;
alter table public.fweta_campaigns enable row level security;
alter table public.fweta_submissions enable row level security;
alter table public.fweta_view_snapshots enable row level security;
alter table public.fweta_wallets enable row level security;
alter table public.fweta_ledger_entries enable row level security;
alter table public.fweta_payout_methods enable row level security;
alter table public.fweta_withdrawal_requests enable row level security;
alter table public.fweta_influencer_profiles enable row level security;
alter table public.fweta_rate_cards enable row level security;
alter table public.fweta_bookings enable row level security;
alter table public.fweta_brand_deposits enable row level security;
alter table public.fweta_fraud_flags enable row level security;

-- Drop the per-user policies from the earlier draft of this migration if a
-- database has them. Other policy names are left in place. The app store
-- deny policy is recreated below.
drop policy if exists fweta_profiles_select on public.fweta_profiles;
drop policy if exists fweta_profiles_insert on public.fweta_profiles;
drop policy if exists fweta_profiles_update on public.fweta_profiles;
drop policy if exists fweta_profiles_delete on public.fweta_profiles;
drop policy if exists fweta_campaigns_select on public.fweta_campaigns;
drop policy if exists fweta_campaigns_write on public.fweta_campaigns;
drop policy if exists fweta_submissions_select on public.fweta_submissions;
drop policy if exists fweta_submissions_insert on public.fweta_submissions;
drop policy if exists fweta_submissions_update on public.fweta_submissions;
drop policy if exists fweta_view_snapshots_select on public.fweta_view_snapshots;
drop policy if exists fweta_wallets_select on public.fweta_wallets;
drop policy if exists fweta_ledger_entries_select on public.fweta_ledger_entries;
drop policy if exists fweta_payout_methods_select on public.fweta_payout_methods;
drop policy if exists fweta_payout_methods_insert on public.fweta_payout_methods;
drop policy if exists fweta_payout_methods_update on public.fweta_payout_methods;
drop policy if exists fweta_payout_methods_delete on public.fweta_payout_methods;
drop policy if exists fweta_withdrawal_requests_select on public.fweta_withdrawal_requests;
drop policy if exists fweta_withdrawal_requests_insert on public.fweta_withdrawal_requests;
drop policy if exists fweta_withdrawal_requests_update on public.fweta_withdrawal_requests;
drop policy if exists fweta_influencer_profiles_select on public.fweta_influencer_profiles;
drop policy if exists fweta_influencer_profiles_write on public.fweta_influencer_profiles;
drop policy if exists fweta_rate_cards_select on public.fweta_rate_cards;
drop policy if exists fweta_rate_cards_write on public.fweta_rate_cards;
drop policy if exists fweta_bookings_select on public.fweta_bookings;
drop policy if exists fweta_bookings_insert on public.fweta_bookings;
drop policy if exists fweta_bookings_update on public.fweta_bookings;
drop policy if exists fweta_brand_deposits_select on public.fweta_brand_deposits;
drop policy if exists fweta_brand_deposits_insert on public.fweta_brand_deposits;
drop policy if exists fweta_brand_deposits_update on public.fweta_brand_deposits;
drop policy if exists fweta_fraud_flags_select on public.fweta_fraud_flags;
drop policy if exists fweta_fraud_flags_insert on public.fweta_fraud_flags;
drop policy if exists fweta_fraud_flags_update on public.fweta_fraud_flags;

drop policy if exists fweta_app_store_no_user_access on public.fweta_app_store;
create policy fweta_app_store_no_user_access
  on public.fweta_app_store
  for all
  to anon, authenticated
  using (false)
  with check (false);
