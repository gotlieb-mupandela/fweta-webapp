-- File 3 default-privilege test. Throwaway database, one transaction, rolled back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/default_client_privileges.sql
-- (a) a table, sequence, and function created by postgres after the revoke
--     have no anon or authenticated grants. The global function revoke runs
--     for postgres only.
-- (b) a fresh fweta_ table and sequence created by supabase_admin also have
--     no client grants. A function that role creates stays executable by
--     anon and authenticated: supabase_admin gets only the IN SCHEMA public
--     statements, and that does not remove the built-in EXECUTE grant to public.
-- Without a snapshot the rollback raises and does not restore defaults.
-- This script then rolls the transaction back.

\set ON_ERROR_STOP on
begin;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase-like defaults for postgres. supabase_admin is still absent, so
-- the first apply must skip that role without error.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to public;

create table public.dp_control (id int);
create sequence public.dp_control_seq;
create function public.dp_control_fn() returns int language sql as $$ select 1 $$;

do $control$
begin
  if not has_table_privilege('anon', 'public.dp_control', 'SELECT')
     or not has_table_privilege('authenticated', 'public.dp_control', 'INSERT') then
    raise exception 'control table did not receive client default grants';
  end if;
  if not has_function_privilege('anon', 'public.dp_control_fn()'::regprocedure, 'execute') then
    raise exception 'control function did not receive anon execute';
  end if;
end
$control$;

\ir ../migrations/20261026120200_revoke_default_client_privileges.sql

-- (a) postgres, after the revoke.
create table public.dp_after_postgres (id int);
create sequence public.dp_after_postgres_seq;
create function public.dp_after_postgres_fn() returns int language sql as $$ select 1 $$;

do $after_postgres$
begin
  if has_table_privilege('anon', 'public.dp_after_postgres', 'SELECT')
     or has_table_privilege('anon', 'public.dp_after_postgres', 'INSERT')
     or has_table_privilege('anon', 'public.dp_after_postgres', 'UPDATE')
     or has_table_privilege('anon', 'public.dp_after_postgres', 'DELETE')
     or has_table_privilege('authenticated', 'public.dp_after_postgres', 'SELECT')
     or has_table_privilege('authenticated', 'public.dp_after_postgres', 'INSERT')
     or has_table_privilege('authenticated', 'public.dp_after_postgres', 'UPDATE')
     or has_table_privilege('authenticated', 'public.dp_after_postgres', 'DELETE') then
    raise exception 'postgres-created table still has client grants';
  end if;
  if has_sequence_privilege('anon', 'public.dp_after_postgres_seq', 'USAGE')
     or has_sequence_privilege('authenticated', 'public.dp_after_postgres_seq', 'SELECT') then
    raise exception 'postgres-created sequence still has client grants';
  end if;
  if has_function_privilege('anon', 'public.dp_after_postgres_fn()'::regprocedure, 'execute')
     or has_function_privilege('authenticated', 'public.dp_after_postgres_fn()'::regprocedure, 'execute') then
    raise exception 'postgres-created function is still executable by a client role';
  end if;
  if not has_table_privilege('service_role', 'public.dp_after_postgres', 'INSERT')
     or not has_table_privilege('service_role', 'public.dp_after_postgres', 'SELECT') then
    raise exception 'service_role lost default table access';
  end if;
  if not has_function_privilege('service_role', 'public.dp_after_postgres_fn()'::regprocedure, 'execute') then
    raise exception 'service_role lost default function execute';
  end if;
  if not exists (
    select 1
    from pg_default_acl d
    join pg_roles r on r.oid = d.defaclrole
    where r.rolname = 'postgres'
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
  ) then
    raise exception 'postgres is missing the global function default privilege';
  end if;
end
$after_postgres$;

-- supabase_admin gets the bad defaults after it appears, then File 3 clears them.
do $make_admin$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin superuser nologin;
  end if;
end
$make_admin$;

alter default privileges for role supabase_admin in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public
  grant execute on functions to public;

set local role supabase_admin;
create table public.fweta_before_admin_revoke (id int);
reset role;

do $admin_control$
begin
  if not has_table_privilege('anon', 'public.fweta_before_admin_revoke', 'SELECT') then
    raise exception 'supabase_admin control table did not receive anon select';
  end if;
end
$admin_control$;

\ir ../migrations/20261026120200_revoke_default_client_privileges.sql

set local role supabase_admin;
create table public.fweta_after_admin (id int);
create sequence public.fweta_after_admin_seq;
create function public.fweta_after_admin_fn() returns int language sql as $$ select 1 $$;
reset role;

do $after_admin$
begin
  if has_table_privilege('anon', 'public.fweta_after_admin', 'SELECT')
     or has_table_privilege('anon', 'public.fweta_after_admin', 'INSERT')
     or has_table_privilege('anon', 'public.fweta_after_admin', 'UPDATE')
     or has_table_privilege('anon', 'public.fweta_after_admin', 'DELETE')
     or has_table_privilege('authenticated', 'public.fweta_after_admin', 'SELECT')
     or has_table_privilege('authenticated', 'public.fweta_after_admin', 'INSERT')
     or has_table_privilege('authenticated', 'public.fweta_after_admin', 'UPDATE')
     or has_table_privilege('authenticated', 'public.fweta_after_admin', 'DELETE') then
    raise exception 'supabase_admin fweta_ table still has client grants';
  end if;
  if has_sequence_privilege('anon', 'public.fweta_after_admin_seq', 'USAGE')
     or has_sequence_privilege('authenticated', 'public.fweta_after_admin_seq', 'UPDATE') then
    raise exception 'supabase_admin sequence still has client grants';
  end if;
  -- In-schema revoke does not remove the built-in EXECUTE grant to public.
  -- The global revoke is postgres only, so this function stays executable.
  if not has_function_privilege('anon', 'public.fweta_after_admin_fn()'::regprocedure, 'execute')
     or not has_function_privilege('authenticated', 'public.fweta_after_admin_fn()'::regprocedure, 'execute')
     or not has_function_privilege('public', 'public.fweta_after_admin_fn()'::regprocedure, 'execute') then
    raise exception 'schema-only revoke removed built-in execute for a supabase_admin function';
  end if;
  if exists (
    select 1
    from pg_default_acl d
    join pg_roles r on r.oid = d.defaclrole
    where r.rolname = 'supabase_admin'
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
  ) then
    raise exception 'supabase_admin has a global function default privilege';
  end if;
  if not has_table_privilege('service_role', 'public.fweta_after_admin', 'UPDATE') then
    raise exception 'service_role lost default access on the supabase_admin table';
  end if;
  if not has_function_privilege('service_role', 'public.fweta_after_admin_fn()'::regprocedure, 'execute') then
    raise exception 'service_role lost default execute on the supabase_admin function';
  end if;
end
$after_admin$;

-- Second apply is a no-op and still blocks a newer postgres table.
\ir ../migrations/20261026120200_revoke_default_client_privileges.sql
create table public.dp_after_second (id int);

do $second$
begin
  if has_table_privilege('authenticated', 'public.dp_after_second', 'SELECT') then
    raise exception 'second apply left a client grant on a new table';
  end if;
end
$second$;

\unset file3_did_not_raise
savepoint file3_no_snapshot;
\set ON_ERROR_STOP off
\ir ../rollbacks/20261026120200_revoke_default_client_privileges.down.sql
select 1 as file3_did_not_raise \gset
\set ON_ERROR_STOP on
rollback to savepoint file3_no_snapshot;
\if :{?file3_did_not_raise}
do $file3_should_have_raised$
begin
  raise exception 'file 3 rollback without snapshot did not raise';
end
$file3_should_have_raised$;
\endif

do $defaults_stay_revoked$
begin
  if not exists (
    select 1
    from pg_default_acl d
    join pg_roles r on r.oid = d.defaclrole
    where r.rolname = 'postgres'
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
  ) then
    raise exception 'file 3 rollback without snapshot removed the postgres global revoke';
  end if;
  if exists (
    select 1
    from pg_default_acl d
    join pg_roles r on r.oid = d.defaclrole
    where r.rolname = 'supabase_admin'
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
  ) then
    raise exception 'file 3 rollback without snapshot gave supabase_admin a global function default';
  end if;
end
$defaults_stay_revoked$;

do $rollback_source$
declare
  body text;
begin
  body := lower(pg_read_file('/workspace/supabase/rollbacks/20261026120200_revoke_default_client_privileges.down.sql'));
  if position('refusing to restore client grants without the psql variable snapshot' in body) = 0 then
    raise exception 'file 3 rollback does not fail loudly without a snapshot';
  end if;
  if position('grant all on tables' in body) > 0
     or position('grant execute on functions' in body) > 0
     or position('grant all on functions' in body) > 0 then
    raise exception 'file 3 rollback still grants default privileges';
  end if;
end
$rollback_source$;

rollback;
