-- APPLY ONLY AFTER Gotlieb confirms nothing else shares this Supabase project.
-- Apply this file last. It is the riskiest of the three.
--
-- Default privileges for objects created later by postgres or by
-- supabase_admin. A missing owner role is skipped. anon and authenticated
-- lose default grants on future tables, sequences, and functions in public.
-- public loses the schema-level default EXECUTE on future functions in
-- public. service_role defaults are not changed. Existing tables are not
-- changed here; the fweta_ file revokes those.
--
-- PostgreSQL merges an in-schema default on top of the built-in default,
-- which grants EXECUTE on functions to public. A revoke inside the schema
-- does not remove that built-in grant. The global revoke below removes it
-- for role postgres only. That statement is not limited to schema public.
-- Hosted Supabase behaviour for the same global statement on
-- supabase_admin cannot be verified, so that role keeps only the
-- IN SCHEMA public statements. Functions supabase_admin creates can still
-- be executable through the built-in grant.
--
-- The in-schema statements apply to schema public. Another app sharing the
-- project would stop receiving client grants on objects those roles create
-- in public after this file runs. The global function revoke for postgres
-- also covers functions that role creates in other schemas.
--
-- Overlap with PR 28 (cursor/security-lockdown-vercel-checks-2c49, not on
-- main): that migration revokes default EXECUTE on functions in public from
-- public, anon, and authenticated for role postgres only. This file also
-- covers tables, sequences, and role supabase_admin inside schema public.
-- The global function revoke is postgres only, same as the wider scope that
-- can be checked here. It does not copy the policies or the authenticated
-- table grants from that migration. PR 28 must never be applied after File 1.
-- Its grants give authenticated access back on fweta_ tables.

do $default_revoke$
declare
  owner_name text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'anon and authenticated roles are required';
  end if;

  foreach owner_name in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = owner_name) then
      raise notice 'skipping default privileges for % because that role is absent', owner_name;
      continue;
    end if;

    execute format(
      'alter default privileges for role %I in schema public revoke all on tables from anon, authenticated',
      owner_name
    );
    execute format(
      'alter default privileges for role %I in schema public revoke all on sequences from anon, authenticated',
      owner_name
    );
    execute format(
      'alter default privileges for role %I in schema public revoke all on functions from anon, authenticated',
      owner_name
    );
    execute format(
      'alter default privileges for role %I in schema public revoke execute on functions from public',
      owner_name
    );
  end loop;

  -- Global revoke for postgres only. See the header: this is not limited
  -- to schema public, and the same statement is not run for supabase_admin.
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    execute 'alter default privileges for role postgres revoke execute on functions from public';
  end if;
end
$default_revoke$;
