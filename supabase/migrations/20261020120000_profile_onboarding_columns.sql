-- NOT applied to production by this change.
-- The live app keeps accounts in public.fweta_app_store (the JSON document).
-- Run this in the Supabase SQL editor only if FWETA_RELATIONAL_SYNC is turned on.
-- fweta_profiles was missing the business onboarding columns, so a relational
-- read dropped company name, phone, socials, and onboarding completion.
-- RLS stays enabled with no anon policies. The service role bypasses RLS.
-- Do not add a public policy. Bank details stay in payout method ciphertext.

alter table public.fweta_profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists company_name text,
  add column if not exists website text,
  add column if not exists niche text,
  add column if not exists location text,
  add column if not exists primary_platform text,
  add column if not exists socials jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;

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
        suspended,
        first_name as "firstName", last_name as "lastName", phone,
        company_name as "companyName", website, niche, location,
        primary_platform as "primaryPlatform", socials,
        case when onboarding_completed_at is null then null
             else to_char(onboarding_completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end as "onboardingCompletedAt"
      from fweta_profiles
    ) p), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from (
      select id, brand_id as "brandId", title, description, type, category, status,
        budget_total_cents as "budgetTotalCents", budget_spent_cents as "budgetSpentCents",
        cpm_cents as "cpmCents", max_payout_per_submission_cents as "maxPayoutPerSubmissionCents",
        platforms, requirements,
        case when end_date is null then null else to_char(end_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end as "endDate",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_campaigns
    ) c), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from (
      select id, campaign_id as "campaignId", clipper_id as "clipperId", post_url as "postUrl",
        platform, status, review_note as "reviewNote", views, earnings_cents as "earningsCents",
        to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from fweta_submissions
    ) s), '[]'::jsonb),
    'viewSnapshots', coalesce((select jsonb_agg(to_jsonb(v) order by v.recorded_at) from (
      select id, submission_id as "submissionId", views,
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
    notify_email, notify_withdrawals, notify_bookings, suspended, created_at, updated_at,
    first_name, last_name, phone, company_name, website, niche, location,
    primary_platform, socials, onboarding_completed_at
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
    case
      when coalesce(p->>'onboardingCompletedAt', '') in ('', 'seeded') then null
      else (p->>'onboardingCompletedAt')::timestamptz
    end
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


grant execute on function public.fweta_load_store() to service_role;
grant execute on function public.fweta_save_store(jsonb) to service_role;
