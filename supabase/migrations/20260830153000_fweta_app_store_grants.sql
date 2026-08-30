-- Fix production: fweta_app_store permissions for service_role
-- Run once in Supabase → SQL Editor (safe to re-run)

create table if not exists public.fweta_app_store (
  id text primary key default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.fweta_app_store enable row level security;

-- PostgreSQL privileges (required even when RLS is bypassed by service_role)
grant usage on schema public to service_role;
grant all privileges on table public.fweta_app_store to service_role;

-- Future tables in this project
alter default privileges in schema public
  grant all on tables to service_role;

-- Optional: all existing public tables (if you ran the full schema migration)
grant all privileges on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
