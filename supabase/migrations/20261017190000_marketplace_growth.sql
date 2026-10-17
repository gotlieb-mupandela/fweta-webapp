-- Saved campaigns, support, audit, prizes, fee setting, and campaign brief fields.
-- The JSON document in fweta_app_store remains the source of truth.
-- Apply on a local database only. This file does not connect to a hosted project.

alter table public.fweta_campaigns add column if not exists caption_guide text;
alter table public.fweta_campaigns add column if not exists hashtags jsonb not null default '[]'::jsonb;
alter table public.fweta_campaigns add column if not exists required_checks jsonb not null default '[]'::jsonb;
alter table public.fweta_campaigns add column if not exists fee_bps integer;

alter table public.fweta_submissions add column if not exists confirmed_checks jsonb not null default '[]'::jsonb;

alter table public.fweta_profiles add column if not exists referral_code text;
alter table public.fweta_profiles add column if not exists referred_by uuid;

create table if not exists public.fweta_saved_campaigns (
  id uuid primary key,
  user_id uuid not null,
  campaign_id uuid not null,
  created_at timestamptz not null
);

create table if not exists public.fweta_support_tickets (
  id uuid primary key,
  user_id uuid not null,
  subject text not null,
  status text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.fweta_support_messages (
  id uuid primary key,
  ticket_id uuid not null,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null
);

create table if not exists public.fweta_audit_log (
  id uuid primary key,
  actor_id uuid not null,
  action text not null,
  summary text not null,
  target_type text not null,
  target_id text,
  created_at timestamptz not null
);

create table if not exists public.fweta_prize_awards (
  id uuid primary key,
  week_key text not null,
  user_id uuid not null,
  place integer not null,
  amount_cents integer not null,
  created_at timestamptz not null
);

create table if not exists public.fweta_platform_settings (
  id text primary key,
  platform_fee_bps integer not null,
  updated_at timestamptz not null,
  updated_by uuid
);

alter table public.fweta_saved_campaigns enable row level security;
alter table public.fweta_support_tickets enable row level security;
alter table public.fweta_support_messages enable row level security;
alter table public.fweta_audit_log enable row level security;
alter table public.fweta_prize_awards enable row level security;
alter table public.fweta_platform_settings enable row level security;

revoke all on public.fweta_saved_campaigns from public, anon, authenticated;
revoke all on public.fweta_support_tickets from public, anon, authenticated;
revoke all on public.fweta_support_messages from public, anon, authenticated;
revoke all on public.fweta_audit_log from public, anon, authenticated;
revoke all on public.fweta_prize_awards from public, anon, authenticated;
revoke all on public.fweta_platform_settings from public, anon, authenticated;

grant select, insert, update, delete on public.fweta_saved_campaigns to service_role;
grant select, insert, update, delete on public.fweta_support_tickets to service_role;
grant select, insert, update, delete on public.fweta_support_messages to service_role;
grant select, insert, update, delete on public.fweta_audit_log to service_role;
grant select, insert, update, delete on public.fweta_prize_awards to service_role;
grant select, insert, update, delete on public.fweta_platform_settings to service_role;
