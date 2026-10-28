\ir 00_guard.sql

-- Local stand-in for the Supabase cluster roles and the auth helpers the
-- compare-and-swap function calls. This is not a migration.
--
-- Loaded unchanged, before this file's grants to anon and authenticated:
--   supabase/migrations/20260829140000_fweta_app_store.sql
--   supabase/migrations/20260830153000_fweta_app_store_grants.sql
-- The shell loads those two files. They only need the service_role role.
--
-- Not loaded:
--   20260829000000_init.sql references auth.users, which this stub does not create.
--   20260913140000_avatars_bucket.sql writes storage.buckets. There is no storage schema.
--   20260829150000_fweta_full_schema.sql and later relational migrations replace
--   fweta_load_store / fweta_save_store. The live write path is the JSON document.
--   20261017160000_production_hardening.sql adds a revision column of its own.
--   The production state this split is for has no revision column, so that file
--   is not part of the baseline.
--
-- Stubbed here:
--   roles anon, authenticated, service_role, postgres (if missing), supabase_admin.
--   service_role is created with BYPASSRLS, which hosted Supabase sets. The table
--   has RLS and no policies, so a plain grant would not let the old upsert write.
--   An existing service_role without BYPASSRLS is left untouched and the run stops.
--   auth.role() and auth.uid() read request.jwt.claims only.
--   USAGE on schema public for anon and authenticated. Hosted Supabase grants that
--   by default. The store migrations grant it only to service_role. Without this
--   stub, an anon call fails on the schema before the function privilege is tested.

do $rehearsal_roles$
declare
  bypass boolean;
begin
  if not (select rolsuper from pg_roles where rolname = current_user) then
    raise exception 'rehearsal must connect as a superuser, got %', current_user;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'postgres') then
    create role postgres login superuser;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;

  select rolbypassrls into bypass from pg_roles where rolname = 'service_role';
  if not coalesce(bypass, false) then
    raise exception 'service_role exists without BYPASSRLS; refusing to alter an existing role';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin superuser bypassrls;
  end if;
end
$rehearsal_roles$;

create schema if not exists auth;

create or replace function auth.role()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    ''
  )::uuid
$$;

comment on function auth.role() is
  'Rehearsal stub. Reads request.jwt.claims ->> role. Hosted PostgREST sets that GUC from the API key.';

comment on function auth.uid() is
  'Rehearsal stub. Reads request.jwt.claims ->> sub. Hosted PostgREST sets that GUC from the API key.';

revoke all on schema auth from public;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Hosted default. Not present in the two fweta_app_store migrations.
grant usage on schema public to anon, authenticated, service_role;

do $rehearsal_role_report$
declare
  rec record;
begin
  for rec in
    select rolname, rolsuper, rolbypassrls, rolcanlogin
    from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin')
    order by rolname
  loop
    raise notice 'role % super=% bypassrls=% login=%',
      rec.rolname, rec.rolsuper, rec.rolbypassrls, rec.rolcanlogin;
  end loop;
end
$rehearsal_role_report$;
