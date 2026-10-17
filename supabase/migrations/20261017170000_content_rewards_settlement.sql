-- View settlement, pool campaigns, country targets, fee reserve, linked accounts.
alter table public.fweta_campaigns
  add column if not exists min_views integer not null default 0,
  add column if not exists pay_model text not null default 'cpm',
  add column if not exists countries jsonb not null default '[]'::jsonb,
  add column if not exists fee_reserved_cents integer not null default 0,
  add column if not exists fee_charged_cents integer not null default 0,
  add column if not exists fee_refunded_cents integer not null default 0,
  add column if not exists unspent_returned_cents integer not null default 0,
  add column if not exists pool_settled_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.fweta_submissions
  add column if not exists baseline_views integer,
  add column if not exists payable_views integer not null default 0,
  add column if not exists reserved_cents integer not null default 0,
  add column if not exists released_cents integer not null default 0,
  add column if not exists approved_at timestamptz,
  add column if not exists earning_until timestamptz,
  add column if not exists hold_until timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists payout_state text not null default 'none',
  add column if not exists next_poll_at timestamptz,
  add column if not exists last_polled_at timestamptz,
  add column if not exists post_live boolean,
  add column if not exists likes integer,
  add column if not exists comments integer,
  add column if not exists fraud_score integer not null default 0,
  add column if not exists fraud_state text not null default 'clear',
  add column if not exists fraud_reasons jsonb not null default '[]'::jsonb,
  add column if not exists appeal_used boolean not null default false;

alter table public.fweta_fraud_flags
  add column if not exists kind text not null default 'manual',
  add column if not exists score integer,
  add column if not exists appeal_note text;

alter table public.fweta_view_snapshots
  add column if not exists likes integer,
  add column if not exists comments integer,
  add column if not exists note text,
  add column if not exists screenshot_path text,
  add column if not exists checked_by uuid,
  add column if not exists source text not null default 'admin',
  add column if not exists status text not null default 'confirmed';

create table if not exists public.fweta_linked_accounts (
  id uuid primary key,
  user_id uuid not null references public.fweta_profiles(id) on delete cascade,
  platform social_platform not null,
  handle text not null,
  bio_code text not null,
  verified_at timestamptz,
  check_source text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

alter table public.fweta_linked_accounts enable row level security;

create or replace function public.fweta_load_store()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from (
      select id, email, password_hash as "passwordHash", display_name as "displayName", bio,
        avatar_url as "avatarUrl", roles, primary_role as "primaryRole",
        notify_email as "notifyEmail", notify_withdrawals as "notifyWithdrawals",
        notify_bookings as "notifyBookings",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt",
        suspended
      from fweta_profiles
    ) p), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from (
      select id, brand_id as "brandId", title, description, type, category, status,
        budget_total_cents as "budgetTotalCents", budget_spent_cents as "budgetSpentCents",
        cpm_cents as "cpmCents", max_payout_per_submission_cents as "maxPayoutPerSubmissionCents",
        platforms, requirements,
        case when start_date is null then null else to_char(start_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "startDate",
        coalesce(rules, '') as rules,
        coalesce(assets, '[]'::jsonb) as assets,
        coalesce(min_payout_cents, 0) as "minPayoutCents",
        coalesce(min_views, 0) as "minViews",
        coalesce(pay_model, 'cpm') as "payModel",
        coalesce(countries, '[]'::jsonb) as countries,
        coalesce(fee_reserved_cents, 0) as "feeReservedCents",
        coalesce(fee_charged_cents, 0) as "feeChargedCents",
        coalesce(fee_refunded_cents, 0) as "feeRefundedCents",
        coalesce(unspent_returned_cents, 0) as "unspentReturnedCents",
        case when pool_settled_at is null then null else to_char(pool_settled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "poolSettledAt",
        case when closed_at is null then null else to_char(closed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "closedAt",
        case when end_date is null then null else to_char(end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "endDate",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_campaigns
    ) c), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from (
      select id, campaign_id as "campaignId", clipper_id as "clipperId", post_url as "postUrl",
        platform, status, review_note as "reviewNote", views, earnings_cents as "earningsCents",
        baseline_views as "baselineViews",
        coalesce(payable_views, 0) as "payableViews",
        coalesce(reserved_cents, 0) as "reservedCents",
        coalesce(released_cents, 0) as "releasedCents",
        case when approved_at is null then null else to_char(approved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "approvedAt",
        case when earning_until is null then null else to_char(earning_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "earningUntil",
        case when hold_until is null then null else to_char(hold_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "holdUntil",
        case when released_at is null then null else to_char(released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "releasedAt",
        coalesce(payout_state, 'none') as "payoutState",
        case when next_poll_at is null then null else to_char(next_poll_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "nextPollAt",
        case when last_polled_at is null then null else to_char(last_polled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "lastPolledAt",
        post_live as "postLive",
        likes, comments,
        coalesce(fraud_score, 0) as "fraudScore",
        coalesce(fraud_state, 'clear') as "fraudState",
        coalesce(fraud_reasons, '[]'::jsonb) as "fraudReasons",
        coalesce(appeal_used, false) as "appealUsed",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_submissions
    ) s), '[]'::jsonb),
    'viewSnapshots', coalesce((select jsonb_agg(to_jsonb(v) order by v.recorded_at) from (
      select id, submission_id as "submissionId", views,
        likes, comments, note,
        screenshot_path as "screenshotPath",
        checked_by::text as "checkedBy",
        coalesce(source, 'admin') as source,
        coalesce(status, 'confirmed') as status,
        to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "recordedAt"
      from fweta_view_snapshots
    ) v), '[]'::jsonb),
    'wallets', coalesce((select jsonb_agg(to_jsonb(w)) from (
      select user_id as "userId", available_cents as "availableCents", pending_cents as "pendingCents",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_wallets
    ) w), '[]'::jsonb),
    'ledgerEntries', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at) from (
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
    'withdrawalRequests', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at) from (
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
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from (
      select id, brand_id as "brandId", influencer_id as "influencerId",
        influencer_profile_id as "influencerProfileId", rate_card_item_id as "rateCardItemId",
        amount_cents as "amountCents", brief, deliverable_url as "deliverableUrl", status,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_bookings
    ) b), '[]'::jsonb),
    'brandDeposits', coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from (
      select id, brand_id as "brandId", amount_cents as "amountCents", note, status,
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"
      from fweta_brand_deposits
    ) d), '[]'::jsonb),
    'fraudFlags', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from (
      select id, submission_id as "submissionId", reason, status,
        coalesce(kind, 'manual') as kind,
        score,
        appeal_note as "appealNote",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        case when resolved_at is null then null else to_char(resolved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "resolvedAt"
      from fweta_fraud_flags
    ) f), '[]'::jsonb),
    'linkedAccounts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from (
      select id, user_id as "userId", platform, handle, bio_code as "bioCode",
        check_source as "checkSource",
        case when verified_at is null then null else to_char(verified_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "verifiedAt",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_linked_accounts
    ) a), '[]'::jsonb)
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
  delete from fweta_profiles;

  insert into fweta_profiles
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

  insert into fweta_linked_accounts
  select
    (a->>'id')::uuid, (a->>'userId')::uuid, (a->>'platform')::social_platform,
    a->>'handle', a->>'bioCode', nullif(a->>'verifiedAt', '')::timestamptz,
    nullif(a->>'checkSource', ''),
    coalesce((a->>'createdAt')::timestamptz, now()),
    coalesce((a->>'updatedAt')::timestamptz, now())
  from jsonb_array_elements(coalesce(payload->'linkedAccounts', '[]'::jsonb)) a;

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
    coalesce((c->>'updatedAt')::timestamptz, now()),
    nullif(c->>'startDate', '')::timestamptz,
    coalesce(c->>'rules', ''),
    coalesce(c->'assets', '[]'::jsonb),
    coalesce((c->>'minPayoutCents')::integer, 0),
    coalesce((c->>'minViews')::integer, 0),
    coalesce(c->>'payModel', 'cpm'),
    coalesce(c->'countries', '[]'::jsonb),
    coalesce((c->>'feeReservedCents')::integer, 0),
    coalesce((c->>'feeChargedCents')::integer, 0),
    coalesce((c->>'feeRefundedCents')::integer, 0),
    coalesce((c->>'unspentReturnedCents')::integer, 0),
    nullif(c->>'poolSettledAt', '')::timestamptz,
    nullif(c->>'closedAt', '')::timestamptz
  from jsonb_array_elements(coalesce(payload->'campaigns', '[]'::jsonb)) c;

  insert into fweta_submissions
  select
    (s->>'id')::uuid, (s->>'campaignId')::uuid, (s->>'clipperId')::uuid,
    s->>'postUrl', (s->>'platform')::social_platform, (s->>'status')::submission_status,
    nullif(s->>'reviewNote', ''), coalesce((s->>'views')::integer, 0),
    coalesce((s->>'earningsCents')::integer, 0),
    coalesce((s->>'createdAt')::timestamptz, now()),
    coalesce((s->>'updatedAt')::timestamptz, now()),
    nullif(s->>'baselineViews', '')::integer,
    coalesce((s->>'payableViews')::integer, 0),
    coalesce((s->>'reservedCents')::integer, 0),
    coalesce((s->>'releasedCents')::integer, 0),
    nullif(s->>'approvedAt', '')::timestamptz,
    nullif(s->>'earningUntil', '')::timestamptz,
    nullif(s->>'holdUntil', '')::timestamptz,
    nullif(s->>'releasedAt', '')::timestamptz,
    coalesce(s->>'payoutState', 'none'),
    nullif(s->>'nextPollAt', '')::timestamptz,
    nullif(s->>'lastPolledAt', '')::timestamptz,
    case when s->>'postLive' is null or s->>'postLive' = '' then null else (s->>'postLive')::boolean end,
    nullif(s->>'likes', '')::integer,
    nullif(s->>'comments', '')::integer,
    coalesce((s->>'fraudScore')::integer, 0),
    coalesce(s->>'fraudState', 'clear'),
    coalesce(s->'fraudReasons', '[]'::jsonb),
    coalesce((s->>'appealUsed')::boolean, false)
  from jsonb_array_elements(coalesce(payload->'submissions', '[]'::jsonb)) s;

  insert into fweta_view_snapshots
  select
    (v->>'id')::uuid, (v->>'submissionId')::uuid, (v->>'views')::integer,
    coalesce((v->>'recordedAt')::timestamptz, now()),
    nullif(v->>'likes', '')::integer,
    nullif(v->>'comments', '')::integer,
    nullif(v->>'note', ''),
    nullif(v->>'screenshotPath', ''),
    nullif(v->>'checkedBy', '')::uuid,
    coalesce(nullif(v->>'source', ''), 'admin'),
    coalesce(nullif(v->>'status', ''), 'confirmed')
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
    nullif(f->>'resolvedAt', '')::timestamptz,
    coalesce(f->>'kind', 'manual'),
    nullif(f->>'score', '')::integer,
    nullif(f->>'appealNote', '')
  from jsonb_array_elements(coalesce(payload->'fraudFlags', '[]'::jsonb)) f;
end;
$$;

grant execute on function public.fweta_load_store() to service_role;
grant execute on function public.fweta_save_store(jsonb) to service_role;
