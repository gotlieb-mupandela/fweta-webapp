-- Throwaway local Postgres only. scripts/security-lockdown-test.sh creates a
-- database named fweta_lockdown_* and runs this file there.
-- Do not point it at a hosted Supabase project.

\set ON_ERROR_STOP on

do $$
begin
  if current_database() not like 'fweta_lockdown%' then
    raise exception 'Refusing to run outside a throwaway fweta_lockdown database (current: %)', current_database();
  end if;
end $$;

do $$
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
end $$;

grant anon to current_user;
grant authenticated to current_user;
grant service_role to current_user;

create schema if not exists auth;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    case
      when nullif(current_setting('request.jwt.claims', true), '') is null then null
      else nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    end
  );
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

\ir ../supabase/migrations/20260829140000_fweta_app_store.sql
\ir ../supabase/migrations/20260829150000_fweta_full_schema.sql
\ir ../supabase/migrations/20261017160000_production_hardening.sql

-- Baseline after production hardening. anon and authenticated must already
-- have no fweta_* table privileges. The lockdown file has to keep that.
create temp table hardening_user_grants as
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'fweta!_%' escape '!'
  and grantee in ('anon', 'authenticated', 'PUBLIC');

create temp table service_role_grants_before as
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'fweta!_%' escape '!'
  and grantee = 'service_role';

do $$
declare
  n integer;
begin
  select count(*) into n from hardening_user_grants;
  if n <> 0 then
    raise exception 'production hardening left % anon/authenticated/PUBLIC table grants', n;
  end if;
end $$;

-- adjust_wallet is not created by the repo migrations. Install a stub so the
-- lockdown replaces it, then grant the privileges the lockdown must remove.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ledger_entry_type') then
    create type public.ledger_entry_type as enum ('credit', 'debit');
  end if;
end $$;

create table if not exists public.wallets (
  user_id uuid primary key,
  available_cents integer not null default 0,
  pending_cents integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount_cents integer not null,
  type public.ledger_entry_type not null,
  reason text,
  reference_type text,
  reference_id uuid,
  balance_after_available_cents integer,
  balance_after_pending_cents integer,
  created_at timestamptz not null default now()
);

create or replace function public.adjust_wallet(
  p_user_id uuid,
  p_available_delta integer,
  p_pending_delta integer,
  p_type public.ledger_entry_type,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid
)
returns jsonb
language sql
as $$ select '{}'::jsonb $$;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant select (password_hash) on public.fweta_profiles to anon, authenticated;
grant execute on function public.fweta_load_store() to public, anon, authenticated;
grant execute on function public.fweta_save_store(jsonb) to public, anon, authenticated;
grant execute on function public.adjust_wallet(uuid, integer, integer, public.ledger_entry_type, text, text, uuid) to public, anon, authenticated;

-- A policy from the earlier draft must be removed. A policy with any other
-- name must stay.
create policy fweta_profiles_update
  on public.fweta_profiles
  for update
  to authenticated
  using (false);

create policy fweta_profiles_keep_me
  on public.fweta_profiles
  for select
  to authenticated
  using (false);

do $$
declare
  n integer;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'fweta!_%' escape '!'
    and grantee in ('anon', 'authenticated');
  if n = 0 then
    raise exception 'setup failed to grant fweta table privileges before the lockdown';
  end if;
  if not has_column_privilege('authenticated', 'public.fweta_profiles', 'password_hash', 'SELECT') then
    raise exception 'setup failed to grant password_hash to authenticated';
  end if;
  if not has_function_privilege('anon', 'public.fweta_load_store()', 'EXECUTE') then
    raise exception 'setup failed to grant fweta_load_store to anon';
  end if;
end $$;

\ir ../supabase/migrations/20261021100752_security_lockdown.sql

insert into public.fweta_profiles (
  id, email, password_hash, display_name, bio, roles, primary_role, created_at, updated_at
) values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'person@example.test',
  'hash-secret',
  'Person',
  '',
  array['clipper']::public.user_role[],
  'clipper',
  now(),
  now()
);

-- Second apply must be a no-op for privileges.
\ir ../supabase/migrations/20261021100752_security_lockdown.sql

do $test$
declare
  rel text;
  priv text;
  role_name text;
  n integer;
  loaded jsonb;
  adjusted jsonb;
  fn text;
begin
  select count(*) into n from hardening_user_grants;
  if n <> 0 then
    raise exception 'hardening baseline changed during the test';
  end if;

  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'fweta!_%' escape '!'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then
    raise exception 'lockdown left % table grants for anon, authenticated, or PUBLIC', n;
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name like 'fweta!_%' escape '!'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then
    raise exception 'lockdown left % column grants for anon, authenticated, or PUBLIC', n;
  end if;

  if exists (
    select table_name, privilege_type from service_role_grants_before
    except
    select table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'fweta!_%' escape '!'
      and grantee = 'service_role'
  ) or exists (
    select table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'fweta!_%' escape '!'
      and grantee = 'service_role'
    except
    select table_name, privilege_type from service_role_grants_before
  ) then
    raise exception 'lockdown changed service_role table grants';
  end if;

  for rel in
    select c.relname
    from pg_class c
    join pg_namespace nsp on nsp.oid = c.relnamespace
    where nsp.nspname = 'public'
      and c.relkind = 'r'
      and c.relname like 'fweta!_%' escape '!'
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace nsp on nsp.oid = c.relnamespace
      where nsp.nspname = 'public'
        and c.relname = rel
        and c.relrowsecurity
    ) then
      raise exception 'RLS is off on %', rel;
    end if;

    foreach role_name in array array['anon', 'authenticated']
    loop
      foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
      loop
        if has_table_privilege(role_name, format('public.%I', rel), priv) then
          raise exception '% still has % on %', role_name, priv, rel;
        end if;
      end loop;
    end loop;
  end loop;

  if has_column_privilege('anon', 'public.fweta_profiles', 'password_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.fweta_profiles', 'password_hash', 'SELECT') then
    raise exception 'password_hash is still readable';
  end if;

  foreach fn in array array[
    'public.fweta_load_store()',
    'public.fweta_save_store(jsonb)',
    'public.adjust_wallet(uuid,integer,integer,public.ledger_entry_type,text,text,uuid)'
  ]
  loop
    if has_function_privilege('anon', fn, 'EXECUTE')
       or has_function_privilege('authenticated', fn, 'EXECUTE')
       or has_function_privilege('public', fn, 'EXECUTE') then
      raise exception 'anon, authenticated, or PUBLIC can execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'service_role cannot execute %', fn;
    end if;
  end loop;

  if position('first_name' in pg_get_functiondef('public.fweta_load_store()'::regprocedure)) > 0
     or position('first_name' in pg_get_functiondef('public.fweta_save_store(jsonb)'::regprocedure)) > 0 then
    raise exception 'store RPC references first_name';
  end if;

  if not exists (
    select 1
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'fweta_app_store'
      and pol.polname = 'fweta_app_store_no_user_access'
  ) then
    raise exception 'fweta_app_store deny policy is missing';
  end if;

  if exists (
    select 1
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'fweta_profiles'
      and pol.polname = 'fweta_profiles_update'
  ) then
    raise exception 'fweta_profiles_update is still installed';
  end if;

  if not exists (
    select 1
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relname = 'fweta_profiles'
      and pol.polname = 'fweta_profiles_keep_me'
  ) then
    raise exception 'an unrelated fweta policy was dropped';
  end if;

  begin
    execute 'set local role authenticated';
    perform password_hash from public.fweta_profiles;
    raise exception 'authenticated read password_hash';
  exception
    when insufficient_privilege then
      null;
  end;

  begin
    execute 'set local role anon';
    perform 1 from public.fweta_profiles;
    raise exception 'anon read fweta_profiles';
  exception
    when insufficient_privilege then
      null;
  end;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
  loaded := public.fweta_load_store();
  if loaded->'profiles'->0->>'email' is distinct from 'person@example.test' then
    raise exception 'service_role load did not return the profile';
  end if;
  execute 'reset role';

  begin
    perform set_config('request.jwt.claim.role', 'service_role', true);
    execute 'set local role service_role';
    perform public.fweta_save_store('{"profiles":[]}'::jsonb);
    raise exception 'empty profile save was accepted';
  exception
    when others then
      if sqlerrm <> 'refusing to replace a populated fweta store with empty profiles' then
        raise;
      end if;
  end;

  if not exists (
    select 1 from public.fweta_profiles where email = 'person@example.test'
  ) then
    raise exception 'empty-profile guard deleted the profile';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
  adjusted := public.adjust_wallet(
    '11111111-1111-1111-1111-111111111111'::uuid,
    100,
    0,
    'credit'::public.ledger_entry_type,
    'test',
    'manual',
    null
  );
  if coalesce((adjusted->'wallet'->>'availableCents')::integer, -1) <> 100 then
    raise exception 'service_role adjust_wallet returned %', adjusted;
  end if;
  execute 'reset role';

  foreach role_name in array array['anon', 'authenticated']
  loop
    begin
      perform set_config('request.jwt.claim.role', role_name, true);
      execute format('set local role %I', role_name);
      perform public.fweta_load_store();
      raise exception '% executed fweta_load_store', role_name;
    exception
      when insufficient_privilege then
        null;
    end;
    begin
      perform set_config('request.jwt.claim.role', role_name, true);
      execute format('set local role %I', role_name);
      perform public.fweta_save_store('{}'::jsonb);
      raise exception '% executed fweta_save_store', role_name;
    exception
      when insufficient_privilege then
        null;
    end;
    begin
      perform set_config('request.jwt.claim.role', role_name, true);
      execute format('set local role %I', role_name);
      perform public.adjust_wallet(
        '11111111-1111-1111-1111-111111111111'::uuid,
        100,
        0,
        'credit'::public.ledger_entry_type,
        'test',
        'manual',
        null
      );
      raise exception '% executed adjust_wallet', role_name;
    exception
      when insufficient_privilege then
        null;
    end;
  end loop;
end
$test$;

-- Migrations on main with a later timestamp. They must not hand table access
-- or these RPCs back to anon or authenticated. The revision migration is
-- allowed to revoke service_role writes on fweta_app_store.
\ir ../supabase/migrations/20261021120000_facebook_and_deposit_audit.sql
\ir ../supabase/migrations/20261021165036_fweta_app_store_revision.sql

do $test$
declare
  n integer;
  fn text;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'fweta!_%' escape '!'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if n <> 0 then
    raise exception 'later migrations restored % table grants', n;
  end if;

  foreach fn in array array[
    'public.fweta_load_store()',
    'public.fweta_save_store(jsonb)',
    'public.adjust_wallet(uuid,integer,integer,public.ledger_entry_type,text,text,uuid)'
  ]
  loop
    if has_function_privilege('anon', fn, 'EXECUTE')
       or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'later migration let anon or authenticated execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'service_role lost execute on %', fn;
    end if;
  end loop;

  if not has_table_privilege('service_role', 'public.fweta_app_store', 'SELECT') then
    raise exception 'service_role cannot select fweta_app_store after the revision migration';
  end if;
  if has_table_privilege('service_role', 'public.fweta_app_store', 'INSERT')
     or has_table_privilege('service_role', 'public.fweta_app_store', 'UPDATE')
     or has_table_privilege('service_role', 'public.fweta_app_store', 'DELETE') then
    raise exception 'service_role can still write fweta_app_store after the revision migration';
  end if;

  raise notice 'security lockdown checks passed';
end
$test$;
