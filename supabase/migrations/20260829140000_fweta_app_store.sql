-- Shared JSON store for Vercel/serverless (single row, service-role access).
-- Run in Supabase → SQL Editor before deploying to production.

create table if not exists public.fweta_app_store (
  id text primary key default 'default',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.fweta_app_store enable row level security;

-- Service role needs explicit PostgreSQL grants (not just RLS bypass)
grant usage on schema public to service_role;
grant all privileges on table public.fweta_app_store to service_role;

-- No public policies: only the service role key (server-side) reads/writes this table.
