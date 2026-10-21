-- Notifications, social accounts, workspaces, onboarding, and the rest of the
-- content-rewards columns, loaded and saved through fweta_load_store / fweta_save_store.
-- Apply on a local database only. This file does not connect to a hosted project.

alter table public.fweta_profiles add column if not exists onboarding jsonb;
alter table public.fweta_profiles add column if not exists journey jsonb;
alter table public.fweta_profiles add column if not exists active_workspace_id uuid;
alter table public.fweta_profiles add column if not exists kyc jsonb;

alter table public.fweta_campaigns add column if not exists workspace_id uuid;
alter table public.fweta_campaigns add column if not exists settled_at timestamptz;

alter table public.fweta_submissions add column if not exists social_account_id uuid;

alter table public.fweta_brand_deposits add column if not exists confirmed_at timestamptz;
alter table public.fweta_brand_deposits add column if not exists confirmed_by uuid;

create table if not exists public.fweta_notifications (
  id uuid primary key,
  user_id uuid not null references public.fweta_profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  href text,
  read_at timestamptz,
  created_at timestamptz not null
);

create table if not exists public.fweta_notification_dispatches (
  id uuid primary key,
  dedupe_key text not null unique,
  created_at timestamptz not null
);

create table if not exists public.fweta_social_accounts (
  id uuid primary key,
  user_id uuid not null references public.fweta_profiles(id) on delete cascade,
  platform social_platform not null,
  handle text not null,
  code text not null,
  status text not null default 'pending',
  is_default boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fweta_workspaces (
  id uuid primary key,
  name text not null,
  owner_user_id uuid not null references public.fweta_profiles(id) on delete cascade,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fweta_workspace_members (
  id uuid primary key,
  workspace_id uuid not null references public.fweta_workspaces(id) on delete cascade,
  user_id uuid references public.fweta_profiles(id) on delete cascade,
  email text not null,
  role text not null,
  status text not null default 'invited',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

alter table public.fweta_notifications enable row level security;
alter table public.fweta_notification_dispatches enable row level security;
alter table public.fweta_social_accounts enable row level security;
alter table public.fweta_workspaces enable row level security;
alter table public.fweta_workspace_members enable row level security;

revoke all on table public.fweta_notifications from anon, authenticated;
revoke all on table public.fweta_notification_dispatches from anon, authenticated;
revoke all on table public.fweta_social_accounts from anon, authenticated;
revoke all on table public.fweta_workspaces from anon, authenticated;
revoke all on table public.fweta_workspace_members from anon, authenticated;

grant all privileges on table public.fweta_notifications to service_role;
grant all privileges on table public.fweta_notification_dispatches to service_role;
grant all privileges on table public.fweta_social_accounts to service_role;
grant all privileges on table public.fweta_workspaces to service_role;
grant all privileges on table public.fweta_workspace_members to service_role;

create index if not exists fweta_notifications_user_idx on public.fweta_notifications (user_id, created_at);
create index if not exists fweta_social_accounts_user_idx on public.fweta_social_accounts (user_id, platform);
create index if not exists fweta_workspace_members_workspace_idx on public.fweta_workspace_members (workspace_id);

create or replace function public.fweta_load_store()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(to_jsonb(p) order by p."createdAt") from (
      select id, email, password_hash as "passwordHash", display_name as "displayName", bio,
        avatar_url as "avatarUrl", roles, primary_role as "primaryRole",
        notify_email as "notifyEmail", notify_withdrawals as "notifyWithdrawals",
        notify_bookings as "notifyBookings", suspended,
        first_name as "firstName", last_name as "lastName", phone,
        company_name as "companyName", website, niche, location,
        primary_platform as "primaryPlatform", socials, onboarding, journey, kyc,
        active_workspace_id as "activeWorkspaceId",
        credential_version as "credentialVersion",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt",
        case when onboarding_completed_at is null then null
          else to_char(onboarding_completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "onboardingCompletedAt"
      from fweta_profiles
    ) p), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c."createdAt") from (
      select id, brand_id as "brandId", workspace_id as "workspaceId", title, description, type, category, status,
        budget_total_cents as "budgetTotalCents", budget_spent_cents as "budgetSpentCents",
        cpm_cents as "cpmCents", max_payout_per_submission_cents as "maxPayoutPerSubmissionCents",
        platforms, requirements, coalesce(rules, '') as rules, coalesce(assets, '[]'::jsonb) as assets,
        coalesce(min_payout_cents, 0) as "minPayoutCents", coalesce(min_views, 0) as "minViews",
        coalesce(pay_model, 'cpm') as "payModel", coalesce(countries, '[]'::jsonb) as countries,
        coalesce(fee_reserved_cents, 0) as "feeReservedCents", coalesce(fee_charged_cents, 0) as "feeChargedCents",
        coalesce(fee_refunded_cents, 0) as "feeRefundedCents", coalesce(unspent_returned_cents, 0) as "unspentReturnedCents",
        case when start_date is null then null else to_char(start_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "startDate",
        case when end_date is null then null else to_char(end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "endDate",
        case when pool_settled_at is null then null else to_char(pool_settled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "poolSettledAt",
        case when closed_at is null then null else to_char(closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "closedAt",
        case when settled_at is null then null else to_char(settled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "settledAt",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_campaigns
    ) c), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s) order by s."createdAt") from (
      select id, campaign_id as "campaignId", clipper_id as "clipperId", social_account_id as "socialAccountId",
        post_url as "postUrl", platform, status, review_note as "reviewNote", views,
        earnings_cents as "earningsCents", baseline_views as "baselineViews",
        coalesce(payable_views, 0) as "payableViews", coalesce(reserved_cents, 0) as "reservedCents",
        coalesce(released_cents, 0) as "releasedCents", coalesce(payout_state, 'none') as "payoutState",
        post_live as "postLive", likes, comments, coalesce(fraud_score, 0) as "fraudScore",
        coalesce(fraud_state, 'clear') as "fraudState", coalesce(fraud_reasons, '[]'::jsonb) as "fraudReasons",
        coalesce(appeal_used, false) as "appealUsed",
        case when approved_at is null then null else to_char(approved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "approvedAt",
        case when earning_until is null then null else to_char(earning_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "earningUntil",
        case when hold_until is null then null else to_char(hold_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "holdUntil",
        case when released_at is null then null else to_char(released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "releasedAt",
        case when next_poll_at is null then null else to_char(next_poll_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "nextPollAt",
        case when last_polled_at is null then null else to_char(last_polled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "lastPolledAt",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_submissions
    ) s), '[]'::jsonb),
    'viewSnapshots', coalesce((select jsonb_agg(to_jsonb(v) order by v."recordedAt") from (
      select id, submission_id as "submissionId", views, likes, comments, note,
        screenshot_path as "screenshotPath", checked_by as "checkedBy",
        coalesce(source, 'admin') as source, coalesce(status, 'confirmed') as status,
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
        confirmed_by as "confirmedBy",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        case when confirmed_at is null then null else to_char(confirmed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "confirmedAt"
      from fweta_brand_deposits
    ) d), '[]'::jsonb),
    'fraudFlags', coalesce((select jsonb_agg(to_jsonb(f) order by f."createdAt") from (
      select id, submission_id as "submissionId", reason, status,
        coalesce(kind, 'manual') as kind, score, appeal_note as "appealNote",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        case when resolved_at is null then null else to_char(resolved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "resolvedAt"
      from fweta_fraud_flags
    ) f), '[]'::jsonb),
    'linkedAccounts', coalesce((select jsonb_agg(to_jsonb(a) order by a."createdAt") from (
      select id, user_id as "userId", platform, handle, bio_code as "bioCode", check_source as "checkSource",
        case when verified_at is null then null else to_char(verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "verifiedAt",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_linked_accounts
    ) a), '[]'::jsonb),
    'socialAccounts', coalesce((select jsonb_agg(to_jsonb(a) order by a."createdAt") from (
      select id, user_id as "userId", platform, handle, code, status, is_default as "isDefault",
        case when verified_at is null then null else to_char(verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "verifiedAt",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_social_accounts
    ) a), '[]'::jsonb),
    'workspaces', coalesce((select jsonb_agg(to_jsonb(w) order by w."createdAt") from (
      select id, name, owner_user_id as "ownerUserId",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_workspaces
    ) w), '[]'::jsonb),
    'workspaceMembers', coalesce((select jsonb_agg(to_jsonb(m) order by m."createdAt") from (
      select id, workspace_id as "workspaceId", user_id as "userId", email, role, status,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_workspace_members
    ) m), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n."createdAt") from (
      select id, user_id as "userId", kind, title, body, href,
        case when read_at is null then null else to_char(read_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "readAt",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
      from fweta_notifications
    ) n), '[]'::jsonb),
    'notificationDispatches', coalesce((select jsonb_agg(to_jsonb(d) order by d."createdAt") from (
      select id, dedupe_key as "dedupeKey",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
      from fweta_notification_dispatches
    ) d), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.fweta_save_store(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
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
  delete from fweta_linked_accounts;
  delete from fweta_social_accounts;
  delete from fweta_notifications;
  delete from fweta_notification_dispatches;
  delete from fweta_workspace_members;
  delete from fweta_workspaces;
  delete from fweta_profiles;

  insert into fweta_profiles (
    id, email, password_hash, display_name, bio, avatar_url, roles, primary_role,
    notify_email, notify_withdrawals, notify_bookings, suspended, created_at, updated_at,
    first_name, last_name, phone, company_name, website, niche, location, primary_platform,
    socials, onboarding_completed_at, credential_version, onboarding, journey, active_workspace_id, kyc
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
    coalesce((p->>'updatedAt')::timestamptz, now()),
    nullif(p->>'firstName', ''), nullif(p->>'lastName', ''), nullif(p->>'phone', ''),
    nullif(p->>'companyName', ''), nullif(p->>'website', ''), nullif(p->>'niche', ''),
    nullif(p->>'location', ''), nullif(p->>'primaryPlatform', ''),
    coalesce(p->'socials', '{}'::jsonb),
    nullif(p->>'onboardingCompletedAt', '')::timestamptz,
    coalesce((p->>'credentialVersion')::integer, 0),
    p->'onboarding', p->'journey', nullif(p->>'activeWorkspaceId', '')::uuid, p->'kyc'
  from jsonb_array_elements(coalesce(payload->'profiles', '[]'::jsonb)) p;

  insert into fweta_workspaces (id, name, owner_user_id, created_at, updated_at)
  select (w->>'id')::uuid, w->>'name', (w->>'ownerUserId')::uuid,
    coalesce((w->>'createdAt')::timestamptz, now()), coalesce((w->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'workspaces', '[]'::jsonb)) w;

  insert into fweta_workspace_members (id, workspace_id, user_id, email, role, status, created_at, updated_at)
  select (m->>'id')::uuid, (m->>'workspaceId')::uuid, nullif(m->>'userId', '')::uuid, m->>'email',
    m->>'role', coalesce(m->>'status', 'invited'),
    coalesce((m->>'createdAt')::timestamptz, now()), coalesce((m->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'workspaceMembers', '[]'::jsonb)) m;

  insert into fweta_linked_accounts (id, user_id, platform, handle, bio_code, verified_at, check_source, created_at, updated_at)
  select (a->>'id')::uuid, (a->>'userId')::uuid, (a->>'platform')::social_platform, a->>'handle', a->>'bioCode',
    nullif(a->>'verifiedAt', '')::timestamptz, nullif(a->>'checkSource', ''),
    coalesce((a->>'createdAt')::timestamptz, now()), coalesce((a->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'linkedAccounts', '[]'::jsonb)) a;

  insert into fweta_social_accounts (id, user_id, platform, handle, code, status, is_default, verified_at, created_at, updated_at)
  select (a->>'id')::uuid, (a->>'userId')::uuid, (a->>'platform')::social_platform, a->>'handle', a->>'code',
    coalesce(a->>'status', 'pending'), coalesce((a->>'isDefault')::boolean, false),
    nullif(a->>'verifiedAt', '')::timestamptz,
    coalesce((a->>'createdAt')::timestamptz, now()), coalesce((a->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'socialAccounts', '[]'::jsonb)) a;

  insert into fweta_campaigns (
    id, brand_id, title, description, type, category, status, budget_total_cents, budget_spent_cents,
    cpm_cents, max_payout_per_submission_cents, platforms, requirements, end_date, created_at, updated_at,
    start_date, rules, assets, min_payout_cents, min_views, pay_model, countries, fee_reserved_cents,
    fee_charged_cents, fee_refunded_cents, unspent_returned_cents, pool_settled_at, closed_at, workspace_id, settled_at
  )
  select
    (c->>'id')::uuid, (c->>'brandId')::uuid, c->>'title', c->>'description',
    (c->>'type')::campaign_type, c->>'category', (c->>'status')::campaign_status,
    (c->>'budgetTotalCents')::integer, coalesce((c->>'budgetSpentCents')::integer, 0),
    (c->>'cpmCents')::integer, (c->>'maxPayoutPerSubmissionCents')::integer,
    array(select jsonb_array_elements_text(c->'platforms'))::social_platform[],
    coalesce(c->>'requirements', ''), nullif(c->>'endDate', '')::timestamptz,
    coalesce((c->>'createdAt')::timestamptz, now()), coalesce((c->>'updatedAt')::timestamptz, now()),
    nullif(c->>'startDate', '')::timestamptz, coalesce(c->>'rules', ''), coalesce(c->'assets', '[]'::jsonb),
    coalesce((c->>'minPayoutCents')::integer, 0), coalesce((c->>'minViews')::integer, 0),
    coalesce(c->>'payModel', 'cpm'), coalesce(c->'countries', '[]'::jsonb),
    coalesce((c->>'feeReservedCents')::integer, 0), coalesce((c->>'feeChargedCents')::integer, 0),
    coalesce((c->>'feeRefundedCents')::integer, 0), coalesce((c->>'unspentReturnedCents')::integer, 0),
    nullif(c->>'poolSettledAt', '')::timestamptz, nullif(c->>'closedAt', '')::timestamptz,
    nullif(c->>'workspaceId', '')::uuid, nullif(c->>'settledAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'campaigns', '[]'::jsonb)) c;

  insert into fweta_submissions (
    id, campaign_id, clipper_id, post_url, platform, status, review_note, views, earnings_cents,
    created_at, updated_at, baseline_views, payable_views, reserved_cents, released_cents, approved_at,
    earning_until, hold_until, released_at, payout_state, next_poll_at, last_polled_at, post_live,
    likes, comments, fraud_score, fraud_state, fraud_reasons, appeal_used, social_account_id
  )
  select
    (s->>'id')::uuid, (s->>'campaignId')::uuid, (s->>'clipperId')::uuid, s->>'postUrl',
    (s->>'platform')::social_platform, (s->>'status')::submission_status, nullif(s->>'reviewNote', ''),
    coalesce((s->>'views')::integer, 0), coalesce((s->>'earningsCents')::integer, 0),
    coalesce((s->>'createdAt')::timestamptz, now()), coalesce((s->>'updatedAt')::timestamptz, now()),
    nullif(s->>'baselineViews', '')::integer, coalesce((s->>'payableViews')::integer, 0),
    coalesce((s->>'reservedCents')::integer, 0), coalesce((s->>'releasedCents')::integer, 0),
    nullif(s->>'approvedAt', '')::timestamptz, nullif(s->>'earningUntil', '')::timestamptz,
    nullif(s->>'holdUntil', '')::timestamptz, nullif(s->>'releasedAt', '')::timestamptz,
    coalesce(s->>'payoutState', 'none'), nullif(s->>'nextPollAt', '')::timestamptz,
    nullif(s->>'lastPolledAt', '')::timestamptz,
    case when s->>'postLive' is null or s->>'postLive' = '' then null else (s->>'postLive')::boolean end,
    nullif(s->>'likes', '')::integer, nullif(s->>'comments', '')::integer,
    coalesce((s->>'fraudScore')::integer, 0), coalesce(s->>'fraudState', 'clear'),
    coalesce(s->'fraudReasons', '[]'::jsonb), coalesce((s->>'appealUsed')::boolean, false),
    nullif(s->>'socialAccountId', '')::uuid
  from jsonb_array_elements(coalesce(payload->'submissions', '[]'::jsonb)) s;

  insert into fweta_view_snapshots (
    id, submission_id, views, recorded_at, likes, comments, note, screenshot_path, checked_by, source, status
  )
  select (v->>'id')::uuid, (v->>'submissionId')::uuid, (v->>'views')::integer,
    coalesce((v->>'recordedAt')::timestamptz, now()), nullif(v->>'likes', '')::integer,
    nullif(v->>'comments', '')::integer, nullif(v->>'note', ''), nullif(v->>'screenshotPath', ''),
    nullif(v->>'checkedBy', '')::uuid, coalesce(nullif(v->>'source', ''), 'admin'),
    coalesce(nullif(v->>'status', ''), 'confirmed')
  from jsonb_array_elements(coalesce(payload->'viewSnapshots', '[]'::jsonb)) v;

  insert into fweta_wallets (user_id, available_cents, pending_cents, updated_at)
  select (w->>'userId')::uuid, coalesce((w->>'availableCents')::integer, 0),
    coalesce((w->>'pendingCents')::integer, 0), coalesce((w->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'wallets', '[]'::jsonb)) w;

  insert into fweta_ledger_entries (
    id, user_id, amount_cents, type, reason, reference_type, reference_id,
    balance_after_available_cents, balance_after_pending_cents, created_at
  )
  select (l->>'id')::uuid, (l->>'userId')::uuid, (l->>'amountCents')::integer, l->>'type', l->>'reason',
    l->>'referenceType', nullif(l->>'referenceId', '')::uuid,
    (l->>'balanceAfterAvailableCents')::integer, (l->>'balanceAfterPendingCents')::integer,
    coalesce((l->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'ledgerEntries', '[]'::jsonb)) l;

  insert into fweta_payout_methods (
    id, user_id, bank_name, branch_code, account_number_enc, account_holder_name, account_type, created_at, updated_at
  )
  select (p->>'id')::uuid, (p->>'userId')::uuid, p->>'bankName', p->>'branchCode', p->>'accountNumberEnc',
    p->>'accountHolderName', (p->>'accountType')::account_type,
    coalesce((p->>'createdAt')::timestamptz, now()), coalesce((p->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'payoutMethods', '[]'::jsonb)) p;

  insert into fweta_withdrawal_requests (
    id, user_id, payout_method_id, amount_cents, status, bank_reference, admin_note, created_at, updated_at, paid_at
  )
  select (w->>'id')::uuid, (w->>'userId')::uuid, (w->>'payoutMethodId')::uuid, (w->>'amountCents')::integer,
    (w->>'status')::withdrawal_status, nullif(w->>'bankReference', ''), nullif(w->>'adminNote', ''),
    coalesce((w->>'createdAt')::timestamptz, now()), coalesce((w->>'updatedAt')::timestamptz, now()),
    nullif(w->>'paidAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'withdrawalRequests', '[]'::jsonb)) w;

  insert into fweta_influencer_profiles (
    id, user_id, slug, display_name, headline, bio, niche, location, avatar_url, socials, featured_work, published, created_at, updated_at
  )
  select (i->>'id')::uuid, (i->>'userId')::uuid, i->>'slug', i->>'displayName', coalesce(i->>'headline', ''),
    coalesce(i->>'bio', ''), coalesce(i->>'niche', ''), coalesce(i->>'location', ''), nullif(i->>'avatarUrl', ''),
    coalesce(i->'socials', '{}'::jsonb),
    coalesce(array(select jsonb_array_elements_text(i->'featuredWork')), '{}'::text[]),
    coalesce((i->>'published')::boolean, false),
    coalesce((i->>'createdAt')::timestamptz, now()), coalesce((i->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'influencerProfiles', '[]'::jsonb)) i;

  insert into fweta_rate_cards (
    id, influencer_profile_id, title, description, type, platform, price_cents, active, created_at, updated_at
  )
  select (r->>'id')::uuid, (r->>'influencerProfileId')::uuid, r->>'title', coalesce(r->>'description', ''),
    r->>'type', r->>'platform', (r->>'priceCents')::integer, coalesce((r->>'active')::boolean, true),
    coalesce((r->>'createdAt')::timestamptz, now()), coalesce((r->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'rateCards', '[]'::jsonb)) r;

  insert into fweta_bookings (
    id, brand_id, influencer_id, influencer_profile_id, rate_card_item_id, amount_cents, brief, deliverable_url, status, created_at, updated_at
  )
  select (b->>'id')::uuid, (b->>'brandId')::uuid, (b->>'influencerId')::uuid,
    (b->>'influencerProfileId')::uuid, (b->>'rateCardItemId')::uuid, (b->>'amountCents')::integer,
    coalesce(b->>'brief', ''), nullif(b->>'deliverableUrl', ''), (b->>'status')::booking_status,
    coalesce((b->>'createdAt')::timestamptz, now()), coalesce((b->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'bookings', '[]'::jsonb)) b;

  insert into fweta_brand_deposits (id, brand_id, amount_cents, note, status, created_at, confirmed_at, confirmed_by)
  select (d->>'id')::uuid, (d->>'brandId')::uuid, (d->>'amountCents')::integer, coalesce(d->>'note', ''),
    coalesce(d->>'status', 'credited'), coalesce((d->>'createdAt')::timestamptz, now()),
    nullif(d->>'confirmedAt', '')::timestamptz, nullif(d->>'confirmedBy', '')::uuid
  from jsonb_array_elements(coalesce(payload->'brandDeposits', '[]'::jsonb)) d;

  insert into fweta_fraud_flags (id, submission_id, reason, status, created_at, resolved_at, kind, score, appeal_note)
  select (f->>'id')::uuid, (f->>'submissionId')::uuid, f->>'reason', coalesce(f->>'status', 'open'),
    coalesce((f->>'createdAt')::timestamptz, now()), nullif(f->>'resolvedAt', '')::timestamptz,
    coalesce(f->>'kind', 'manual'), nullif(f->>'score', '')::integer, nullif(f->>'appealNote', '')
  from jsonb_array_elements(coalesce(payload->'fraudFlags', '[]'::jsonb)) f;

  insert into fweta_notifications (id, user_id, kind, title, body, href, read_at, created_at)
  select (n->>'id')::uuid, (n->>'userId')::uuid, n->>'kind', n->>'title', n->>'body', nullif(n->>'href', ''),
    nullif(n->>'readAt', '')::timestamptz, coalesce((n->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'notifications', '[]'::jsonb)) n;

  insert into fweta_notification_dispatches (id, dedupe_key, created_at)
  select (d->>'id')::uuid, d->>'dedupeKey', coalesce((d->>'createdAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'notificationDispatches', '[]'::jsonb)) d;
end;
$$;

revoke all on function public.fweta_load_store() from public, anon, authenticated;
revoke all on function public.fweta_save_store(jsonb) from public, anon, authenticated;
grant execute on function public.fweta_load_store() to service_role;
grant execute on function public.fweta_save_store(jsonb) to service_role;
