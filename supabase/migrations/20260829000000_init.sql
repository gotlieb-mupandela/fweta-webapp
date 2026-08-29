-- Fweta schema outline for future Supabase migration.
-- Local MVP uses data/store.json; apply these when connecting Postgres.

create type user_role as enum ('brand', 'influencer', 'clipper', 'admin');
create type campaign_type as enum ('clipping', 'ugc');
create type campaign_status as enum ('draft', 'pending', 'active', 'paused', 'completed');
create type submission_status as enum ('pending', 'approved', 'flagged', 'rejected');
create type booking_status as enum ('requested', 'accepted', 'in_progress', 'delivered', 'approved', 'cancelled');
create type withdrawal_status as enum ('pending', 'processing', 'paid', 'rejected');
create type account_type as enum ('cheque', 'savings', 'transmission');
create type social_platform as enum ('tiktok', 'youtube', 'instagram', 'x');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  roles user_role[] not null default '{}',
  primary_role user_role not null,
  notify_email boolean not null default true,
  notify_withdrawals boolean not null default true,
  notify_bookings boolean not null default true,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references profiles(id),
  title text not null,
  description text not null,
  type campaign_type not null,
  category text not null,
  status campaign_status not null default 'draft',
  budget_total_cents integer not null check (budget_total_cents > 0),
  budget_spent_cents integer not null default 0,
  cpm_cents integer not null check (cpm_cents > 0),
  max_payout_per_submission_cents integer not null,
  platforms social_platform[] not null,
  requirements text not null default '',
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id),
  clipper_id uuid not null references profiles(id),
  post_url text not null,
  platform social_platform not null,
  status submission_status not null default 'pending',
  review_note text,
  views integer not null default 0,
  earnings_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table wallets (
  user_id uuid primary key references profiles(id),
  available_cents integer not null default 0,
  pending_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  amount_cents integer not null,
  type text not null check (type in ('credit', 'debit')),
  reason text not null,
  reference_type text not null,
  reference_id uuid,
  balance_after_available_cents integer not null,
  balance_after_pending_cents integer not null,
  created_at timestamptz not null default now()
);

-- Enable RLS on all tables; policies: users see own rows, brands see campaign children, admin full access.
