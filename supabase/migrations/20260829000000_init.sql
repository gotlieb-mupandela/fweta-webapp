-- Fweta schema. Apply against the linked Supabase project.
-- Money is stored as integer cents (NAD). Never update balances without a ledger row.

create schema if not exists private;

create type public.user_role as enum ('brand', 'influencer', 'clipper', 'admin');
create type public.campaign_type as enum ('clipping', 'ugc');
create type public.campaign_status as enum (
  'draft',
  'pending',
  'active',
  'paused',
  'completed'
);
create type public.submission_status as enum (
  'pending',
  'approved',
  'flagged',
  'rejected'
);
create type public.booking_status as enum (
  'requested',
  'accepted',
  'in_progress',
  'delivered',
  'approved',
  'cancelled'
);
create type public.withdrawal_status as enum (
  'pending',
  'processing',
  'paid',
  'rejected'
);
create type public.account_type as enum ('cheque', 'savings', 'transmission');
create type public.social_platform as enum ('tiktok', 'youtube', 'instagram', 'x');
create type public.rate_card_type as enum (
  'per_post',
  'per_reel',
  'per_1k_views',
  'package',
  'ugc_flat'
);
create type public.ledger_entry_type as enum ('credit', 'debit');
create type public.deposit_status as enum ('pending', 'credited');
create type public.fraud_flag_status as enum ('open', 'resolved', 'dismissed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text unique not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  roles public.user_role[] not null default '{}',
  primary_role public.user_role not null,
  notify_email boolean not null default true,
  notify_withdrawals boolean not null default true,
  notify_bookings boolean not null default true,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id),
  title text not null,
  description text not null,
  type public.campaign_type not null,
  category text not null,
  status public.campaign_status not null default 'draft',
  budget_total_cents integer not null check (budget_total_cents > 0),
  budget_spent_cents integer not null default 0 check (budget_spent_cents >= 0),
  cpm_cents integer not null check (cpm_cents > 0),
  max_payout_per_submission_cents integer not null check (max_payout_per_submission_cents >= 0),
  platforms public.social_platform[] not null,
  requirements text not null default '',
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id),
  clipper_id uuid not null references public.profiles (id),
  post_url text not null,
  platform public.social_platform not null,
  status public.submission_status not null default 'pending',
  review_note text,
  views integer not null default 0 check (views >= 0),
  earnings_cents integer not null default 0 check (earnings_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.view_snapshots (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  views integer not null check (views >= 0),
  recorded_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  available_cents integer not null default 0,
  pending_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  amount_cents integer not null check (amount_cents > 0),
  type public.ledger_entry_type not null,
  reason text not null,
  reference_type text not null check (
    reference_type in (
      'admin_credit',
      'campaign_earning',
      'withdrawal',
      'booking_escrow',
      'booking_release',
      'booking_refund',
      'brand_deposit'
    )
  ),
  reference_id uuid,
  balance_after_available_cents integer not null,
  balance_after_pending_cents integer not null,
  created_at timestamptz not null default now()
);

create table public.payout_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  bank_name text not null,
  branch_code text not null,
  account_number_enc text not null,
  account_holder_name text not null,
  account_type public.account_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  payout_method_id uuid not null references public.payout_methods (id),
  amount_cents integer not null check (amount_cents > 0),
  status public.withdrawal_status not null default 'pending',
  bank_reference text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create table public.influencer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  slug text unique not null,
  display_name text not null,
  headline text not null default '',
  bio text not null default '',
  niche text not null default '',
  location text not null default '',
  avatar_url text,
  socials jsonb not null default '{}'::jsonb,
  featured_work text[] not null default '{}',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rate_cards (
  id uuid primary key default gen_random_uuid(),
  influencer_profile_id uuid not null references public.influencer_profiles (id) on delete cascade,
  title text not null,
  description text not null default '',
  type public.rate_card_type not null,
  platform text not null check (
    platform in ('tiktok', 'youtube', 'instagram', 'x', 'multi')
  ),
  price_cents integer not null check (price_cents > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id),
  influencer_id uuid not null references public.profiles (id),
  influencer_profile_id uuid not null references public.influencer_profiles (id),
  rate_card_item_id uuid not null references public.rate_cards (id),
  amount_cents integer not null check (amount_cents > 0),
  brief text not null default '',
  deliverable_url text,
  status public.booking_status not null default 'requested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brand_deposits (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id),
  amount_cents integer not null check (amount_cents > 0),
  note text not null default '',
  status public.deposit_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.fraud_flags (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  reason text not null,
  status public.fraud_flag_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index campaigns_brand_id_idx on public.campaigns (brand_id);
create index campaigns_status_idx on public.campaigns (status);
create index submissions_campaign_id_idx on public.submissions (campaign_id);
create index submissions_clipper_id_idx on public.submissions (clipper_id);
create index view_snapshots_submission_id_idx on public.view_snapshots (submission_id);
create index ledger_entries_user_id_idx on public.ledger_entries (user_id);
create index payout_methods_user_id_idx on public.payout_methods (user_id);
create index withdrawal_requests_user_id_idx on public.withdrawal_requests (user_id);
create index withdrawal_requests_payout_method_id_idx on public.withdrawal_requests (payout_method_id);
create index influencer_profiles_published_idx on public.influencer_profiles (published);
create index rate_cards_influencer_profile_id_idx on public.rate_cards (influencer_profile_id);
create index bookings_brand_id_idx on public.bookings (brand_id);
create index bookings_influencer_id_idx on public.bookings (influencer_id);
create index bookings_influencer_profile_id_idx on public.bookings (influencer_profile_id);
create index bookings_rate_card_item_id_idx on public.bookings (rate_card_item_id);
create index brand_deposits_brand_id_idx on public.brand_deposits (brand_id);
create index fraud_flags_submission_id_idx on public.fraud_flags (submission_id);

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function private.set_updated_at();
create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function private.set_updated_at();
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function private.set_updated_at();
create trigger payout_methods_set_updated_at
  before update on public.payout_methods
  for each row execute function private.set_updated_at();
create trigger withdrawal_requests_set_updated_at
  before update on public.withdrawal_requests
  for each row execute function private.set_updated_at();
create trigger influencer_profiles_set_updated_at
  before update on public.influencer_profiles
  for each row execute function private.set_updated_at();
create trigger rate_cards_set_updated_at
  before update on public.rate_cards
  for each row execute function private.set_updated_at();
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function private.set_updated_at();

-- SECURITY DEFINER so admin checks can read profiles without RLS recursion.
create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and 'admin' = any (roles)
  );
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, primary_role, roles)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    'clipper',
    array['clipper']::public.user_role[]
  );
  insert into public.wallets (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

revoke all on function private.is_admin() from public;
revoke all on function private.handle_new_user() from public;
revoke all on function private.set_updated_at() from public;
grant execute on function private.is_admin() to authenticated;
grant usage on schema private to authenticated;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

grant select on table public.campaigns to anon, authenticated;
grant insert, update, delete on table public.campaigns to authenticated;
grant all on table public.campaigns to service_role;

grant select, insert, update on table public.submissions to authenticated;
grant all on table public.submissions to service_role;

grant select on table public.view_snapshots to authenticated;
grant all on table public.view_snapshots to service_role;

grant select on table public.wallets to authenticated;
grant all on table public.wallets to service_role;

grant select on table public.ledger_entries to authenticated;
grant all on table public.ledger_entries to service_role;

grant select, insert, update, delete on table public.payout_methods to authenticated;
grant all on table public.payout_methods to service_role;

grant select, insert on table public.withdrawal_requests to authenticated;
grant update on table public.withdrawal_requests to authenticated;
grant all on table public.withdrawal_requests to service_role;

grant select on table public.influencer_profiles to anon, authenticated;
grant insert, update, delete on table public.influencer_profiles to authenticated;
grant all on table public.influencer_profiles to service_role;

grant select on table public.rate_cards to anon, authenticated;
grant insert, update, delete on table public.rate_cards to authenticated;
grant all on table public.rate_cards to service_role;

grant select, insert, update on table public.bookings to authenticated;
grant all on table public.bookings to service_role;

grant select, insert on table public.brand_deposits to authenticated;
grant update on table public.brand_deposits to authenticated;
grant all on table public.brand_deposits to service_role;

grant select, insert, update on table public.fraud_flags to authenticated;
grant all on table public.fraud_flags to service_role;

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.submissions enable row level security;
alter table public.view_snapshots enable row level security;
alter table public.wallets enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.payout_methods enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.influencer_profiles enable row level security;
alter table public.rate_cards enable row level security;
alter table public.bookings enable row level security;
alter table public.brand_deposits enable row level security;
alter table public.fraud_flags enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

create policy campaigns_select_public on public.campaigns
  for select to anon
  using (status = 'active');
create policy campaigns_select_auth on public.campaigns
  for select to authenticated
  using (
    status = 'active'
    or brand_id = (select auth.uid())
    or (select private.is_admin())
  );
create policy campaigns_insert on public.campaigns
  for insert to authenticated
  with check (brand_id = (select auth.uid()) or (select private.is_admin()));
create policy campaigns_update on public.campaigns
  for update to authenticated
  using (brand_id = (select auth.uid()) or (select private.is_admin()))
  with check (brand_id = (select auth.uid()) or (select private.is_admin()));
create policy campaigns_delete on public.campaigns
  for delete to authenticated
  using (brand_id = (select auth.uid()) or (select private.is_admin()));

create policy submissions_select on public.submissions
  for select to authenticated
  using (
    clipper_id = (select auth.uid())
    or exists (
      select 1
      from public.campaigns c
      where c.id = submissions.campaign_id
        and c.brand_id = (select auth.uid())
    )
    or (select private.is_admin())
  );
create policy submissions_insert on public.submissions
  for insert to authenticated
  with check (clipper_id = (select auth.uid()) or (select private.is_admin()));
create policy submissions_update on public.submissions
  for update to authenticated
  using (
    clipper_id = (select auth.uid())
    or exists (
      select 1
      from public.campaigns c
      where c.id = submissions.campaign_id
        and c.brand_id = (select auth.uid())
    )
    or (select private.is_admin())
  )
  with check (
    clipper_id = (select auth.uid())
    or exists (
      select 1
      from public.campaigns c
      where c.id = submissions.campaign_id
        and c.brand_id = (select auth.uid())
    )
    or (select private.is_admin())
  );

create policy view_snapshots_select on public.view_snapshots
  for select to authenticated
  using (
    exists (
      select 1
      from public.submissions s
      where s.id = view_snapshots.submission_id
        and (
          s.clipper_id = (select auth.uid())
          or exists (
            select 1
            from public.campaigns c
            where c.id = s.campaign_id
              and c.brand_id = (select auth.uid())
          )
          or (select private.is_admin())
        )
    )
  );

create policy wallets_select on public.wallets
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy ledger_entries_select on public.ledger_entries
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy payout_methods_select on public.payout_methods
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy payout_methods_insert on public.payout_methods
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy payout_methods_update on public.payout_methods
  for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy payout_methods_delete on public.payout_methods
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy withdrawal_requests_select on public.withdrawal_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy withdrawal_requests_insert on public.withdrawal_requests
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy withdrawal_requests_update on public.withdrawal_requests
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy influencer_profiles_select_public on public.influencer_profiles
  for select to anon
  using (published);
create policy influencer_profiles_select_auth on public.influencer_profiles
  for select to authenticated
  using (
    published
    or user_id = (select auth.uid())
    or (select private.is_admin())
  );
create policy influencer_profiles_insert on public.influencer_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy influencer_profiles_update on public.influencer_profiles
  for update to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()))
  with check (user_id = (select auth.uid()) or (select private.is_admin()));
create policy influencer_profiles_delete on public.influencer_profiles
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy rate_cards_select_public on public.rate_cards
  for select to anon
  using (
    exists (
      select 1
      from public.influencer_profiles p
      where p.id = rate_cards.influencer_profile_id
        and p.published
        and rate_cards.active
    )
  );
create policy rate_cards_select_auth on public.rate_cards
  for select to authenticated
  using (
    exists (
      select 1
      from public.influencer_profiles p
      where p.id = rate_cards.influencer_profile_id
        and (
          (p.published and rate_cards.active)
          or p.user_id = (select auth.uid())
          or (select private.is_admin())
        )
    )
  );
create policy rate_cards_write on public.rate_cards
  for all to authenticated
  using (
    exists (
      select 1
      from public.influencer_profiles p
      where p.id = rate_cards.influencer_profile_id
        and (p.user_id = (select auth.uid()) or (select private.is_admin()))
    )
  )
  with check (
    exists (
      select 1
      from public.influencer_profiles p
      where p.id = rate_cards.influencer_profile_id
        and (p.user_id = (select auth.uid()) or (select private.is_admin()))
    )
  );

create policy bookings_select on public.bookings
  for select to authenticated
  using (
    brand_id = (select auth.uid())
    or influencer_id = (select auth.uid())
    or (select private.is_admin())
  );
create policy bookings_insert on public.bookings
  for insert to authenticated
  with check (brand_id = (select auth.uid()) or (select private.is_admin()));
create policy bookings_update on public.bookings
  for update to authenticated
  using (
    brand_id = (select auth.uid())
    or influencer_id = (select auth.uid())
    or (select private.is_admin())
  )
  with check (
    brand_id = (select auth.uid())
    or influencer_id = (select auth.uid())
    or (select private.is_admin())
  );

create policy brand_deposits_select on public.brand_deposits
  for select to authenticated
  using (brand_id = (select auth.uid()) or (select private.is_admin()));
create policy brand_deposits_insert on public.brand_deposits
  for insert to authenticated
  with check (brand_id = (select auth.uid()) or (select private.is_admin()));
create policy brand_deposits_update on public.brand_deposits
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy fraud_flags_select on public.fraud_flags
  for select to authenticated
  using (
    (select private.is_admin())
    or exists (
      select 1
      from public.submissions s
      join public.campaigns c on c.id = s.campaign_id
      where s.id = fraud_flags.submission_id
        and c.brand_id = (select auth.uid())
    )
  );
create policy fraud_flags_insert on public.fraud_flags
  for insert to authenticated
  with check (
    (select private.is_admin())
    or exists (
      select 1
      from public.submissions s
      join public.campaigns c on c.id = s.campaign_id
      where s.id = fraud_flags.submission_id
        and c.brand_id = (select auth.uid())
    )
  );
create policy fraud_flags_update on public.fraud_flags
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

notify pgrst, 'reload schema';
