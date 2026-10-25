-- File 3 default-privilege test. Throwaway database, one transaction, rolled back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/default_client_privileges.sql
-- (a) a table created by postgres after the revoke has no anon or authenticated grants.
-- (b) a fresh fweta_ table created by supabase_admin also has no client grants.
-- The same check covers a sequence and a function for each owner role.
-- The rollback restores both owners, which re-opens that exposure, then this
-- script rolls the transaction back.

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
  if has_function_privilege('anon', 'public.fweta_after_admin_fn()'::regprocedure, 'execute')
     or has_function_privilege('authenticated', 'public.fweta_after_admin_fn()'::regprocedure, 'execute') then
    raise exception 'supabase_admin function is still executable by a client role';
  end if;
  if not has_table_privilege('service_role', 'public.fweta_after_admin', 'UPDATE') then
    raise exception 'service_role lost default access on the supabase_admin table';
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

\ir ../rollbacks/20261026120200_revoke_default_client_privileges.down.sql

create table public.dp_restored_postgres (id int);
set local role supabase_admin;
create table public.fweta_restored_admin (id int);
create function public.fweta_restored_admin_fn() returns int language sql as $$ select 1 $$;
reset role;

do $restored$
begin
  if not has_table_privilege('anon', 'public.dp_restored_postgres', 'INSERT')
     or not has_table_privilege('authenticated', 'public.dp_restored_postgres', 'SELECT') then
    raise exception 'rollback did not restore postgres default grants';
  end if;
  if not has_table_privilege('anon', 'public.fweta_restored_admin', 'SELECT')
     or not has_table_privilege('authenticated', 'public.fweta_restored_admin', 'UPDATE') then
    raise exception 'rollback did not restore supabase_admin default grants';
  end if;
  if not has_function_privilege('anon', 'public.fweta_restored_admin_fn()'::regprocedure, 'execute') then
    raise exception 'rollback did not restore public execute for supabase_admin functions';
  end if;
end
$restored$;

rollback;
