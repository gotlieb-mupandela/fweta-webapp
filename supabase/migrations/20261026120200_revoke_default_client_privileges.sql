-- APPLY ONLY AFTER Gotlieb confirms nothing else shares this Supabase project.
-- Apply this file last. It is the riskiest of the three.
--
-- Default privileges for objects created later by postgres or by
-- supabase_admin. A missing owner role is skipped. anon and authenticated
-- lose default grants on future tables, sequences, and functions in public.
-- public loses default EXECUTE on future functions. The in-schema revoke
-- cannot remove PostgreSQL's built-in EXECUTE grant to public, so this file
-- also revokes that grant globally for the same owner roles. service_role
-- defaults are not changed. Existing tables are not changed here; the fweta_
-- file revokes those.
--
-- This applies to the whole public schema. Another app sharing the project
-- would stop receiving client grants on objects those roles create after
-- this file runs.
--
-- Overlap with PR 28 (cursor/security-lockdown-vercel-checks-2c49, not on
-- main): that migration revokes default EXECUTE on functions in public from
-- public, anon, and authenticated for role postgres only. This file also
-- covers tables, sequences, and role supabase_admin. It does not copy the
-- policies or the authenticated table grants from that migration.

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
    -- Schema-level function privileges are merged on top of PostgreSQL's
    -- built-in default, which grants EXECUTE to public. A revoke inside the
    -- schema does not remove that built-in grant. The global revoke below
    -- replaces it for this owner role, which is what stops anon and
    -- authenticated from calling functions created later. It is not limited
    -- to the public schema.
    execute format(
      'alter default privileges for role %I revoke execute on functions from public',
      owner_name
    );
  end loop;
end
$default_revoke$;
