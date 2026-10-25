-- Rollback for 20261026120200_revoke_default_client_privileges.sql
--
-- This re-opens the exposure. Future tables, sequences, and functions created
-- in public by postgres or supabase_admin would again be granted to anon and
-- authenticated, and future functions would again be executable by public.
-- Another app sharing the project would receive those default grants too.
--
-- Restores both owner roles, and only the privileges the forward file
-- revokes. service_role defaults are untouched. Repo migration
-- 20260830153000 grants default ALL ON TABLES to service_role only; that
-- grant is not removed by the forward file and is not repeated here.
-- The anon, authenticated, and public defaults below are the platform
-- defaults this file removes. They are not GRANT statements in the repo
-- migrations. Putting them back is the inverse of this file, which is what
-- re-opens the exposure.

do $default_down$
declare
  owner_name text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'anon and authenticated roles are required';
  end if;

  foreach owner_name in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = owner_name) then
      raise notice 'skipping default-privilege restore for % because that role is absent', owner_name;
      continue;
    end if;

    execute format(
      'alter default privileges for role %I in schema public grant all on tables to anon, authenticated',
      owner_name
    );
    execute format(
      'alter default privileges for role %I in schema public grant all on sequences to anon, authenticated',
      owner_name
    );
    execute format(
      'alter default privileges for role %I in schema public grant all on functions to anon, authenticated',
      owner_name
    );
    execute format(
      'alter default privileges for role %I in schema public grant execute on functions to public',
      owner_name
    );
    -- Inverse of the global revoke in the forward file. This puts back the
    -- built-in EXECUTE grant to public for functions this role creates.
    execute format(
      'alter default privileges for role %I grant execute on functions to public',
      owner_name
    );
  end loop;
end
$default_down$;
