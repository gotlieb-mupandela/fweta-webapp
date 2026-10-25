-- File 1 privilege test. Run with psql against a throwaway database:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/client_grants.sql
-- The script opens a transaction and rolls it back. It does not keep data.
--
-- /workspace/fweta-qa/pg-rehearsal was not on this machine, so this fixture
-- builds the live names David reported: the 14 fweta_ tables, the 7 public
-- functions, and device_locations. It does not apply repo-only objects.
-- When a named object already exists, the script leaves its columns alone.

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

-- Empty apply: no fweta_ table is required.
\ir ../migrations/20261026120000_revoke_client_table_grants.sql

do $fixture$
declare
  name text;
  names text[] := array[
    'fweta_bookings',
    'fweta_brand_deposits',
    'fweta_campaigns',
    'fweta_fraud_flags',
    'fweta_influencer_profiles',
    'fweta_ledger_entries',
    'fweta_payout_methods',
    'fweta_profiles',
    'fweta_rate_cards',
    'fweta_submissions',
    'fweta_view_snapshots',
    'fweta_wallets',
    'fweta_withdrawal_requests'
  ];
begin
  if to_regclass('public.fweta_app_store') is null then
    create table public.fweta_app_store (
      id text primary key default 'probe',
      data jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
  end if;

  foreach name in array names loop
    if to_regclass('public.' || name) is null then
      execute format(
        'create table public.%I (id int primary key, note text)',
        name
      );
    end if;
  end loop;

  if to_regclass('public.fweta_seq_probe') is null then
    create table public.fweta_seq_probe (
      id bigint generated always as identity primary key,
      note text
    );
  end if;

  if to_regclass('public.device_locations') is null then
    create table public.device_locations (
      id int primary key,
      note text
    );
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adjust_wallet'
  ) then
    create function public.adjust_wallet() returns void language plpgsql as $body$ begin return; end $body$;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fweta_assert_service_role'
  ) then
    create function public.fweta_assert_service_role() returns void language plpgsql as $body$ begin return; end $body$;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fweta_json_store_get'
  ) then
    create function public.fweta_json_store_get() returns jsonb language sql as $$ select '{}'::jsonb $$;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fweta_json_store_set'
  ) then
    create function public.fweta_json_store_set()
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$ begin return; end $body$;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fweta_load_store'
  ) then
    create function public.fweta_load_store() returns jsonb language sql as $$ select '{}'::jsonb $$;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fweta_save_store'
  ) then
    create function public.fweta_save_store(payload jsonb) returns void language plpgsql as $body$ begin return; end $body$;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    create function public.rls_auto_enable() returns trigger language plpgsql as $$ begin return new; end $$;
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fweta_cas_save_store'
  ) then
    create function public.fweta_cas_save_store(payload jsonb, expected_revision bigint)
    returns bigint language sql as $$ select 1::bigint $$;
  end if;
end
$fixture$;

-- Live-shaped starting point: clients hold table grants, and they already
-- cannot execute the seven functions. service_role holds the app path.
do $leak$
declare
  rel record;
  seq_name text;
  fn record;
begin
  for rel in
    select c.oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname like 'fweta\_%' escape '\'
  loop
    execute format('grant all privileges on table %s to anon, authenticated, service_role', rel.oid::regclass);
  end loop;

  for seq_name in
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and exists (
        select 1
        from pg_depend d
        join pg_class t on t.oid = d.refobjid
        where d.objid = c.oid
          and d.deptype in ('a', 'i')
          and t.relname like 'fweta\_%' escape '\'
      )
  loop
    execute format(
      'grant all privileges on sequence %s to anon, authenticated, service_role',
      seq_name
    );
  end loop;

  grant select, insert on table public.device_locations to anon;
  grant select (note) on table public.fweta_profiles to authenticated;

  for fn in
    select p.oid, p.prokind, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'adjust_wallet',
        'fweta_assert_service_role',
        'fweta_json_store_get',
        'fweta_json_store_set',
        'fweta_load_store',
        'fweta_save_store',
        'rls_auto_enable',
        'fweta_cas_save_store'
      )
  loop
    if fn.proname = 'fweta_json_store_set' then
      -- Open client execute, matching the live leak. File 1 must close it
      -- without dropping the function.
      if fn.prokind = 'p' then
        execute format(
          'grant execute on procedure %s to public, anon, authenticated, service_role',
          fn.oid::regprocedure
        );
      else
        execute format(
          'grant execute on function %s to public, anon, authenticated, service_role',
          fn.oid::regprocedure
        );
      end if;
    elsif fn.prokind = 'p' then
      execute format('revoke all on procedure %s from public, anon, authenticated', fn.oid::regprocedure);
      execute format('grant execute on procedure %s to service_role', fn.oid::regprocedure);
    else
      execute format('revoke all on function %s from public, anon, authenticated', fn.oid::regprocedure);
      execute format('grant execute on function %s to service_role', fn.oid::regprocedure);
    end if;
  end loop;
end
$leak$;

create temp table service_table_before as
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
  and table_name like 'fweta\_%' escape '\';

create temp table service_fn_before as
select p.proname, p.oid::regprocedure::text as signature,
       has_function_privilege('service_role', p.oid, 'execute') as allowed
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'adjust_wallet',
    'fweta_assert_service_role',
    'fweta_json_store_get',
    'fweta_json_store_set',
    'fweta_load_store',
    'fweta_save_store',
    'rls_auto_enable',
    'fweta_cas_save_store'
  );

\ir ../migrations/20261026120000_revoke_client_table_grants.sql

create or replace function pg_temp.expect_denied(role_name text, stmt text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-2222-4333-8444-555555555555', true);
  perform set_config(
    'request.jwt.claims',
    '{"sub":"11111111-2222-4333-8444-555555555555","role":"authenticated"}',
    true
  );
  begin
    perform set_config('role', role_name, true);
    if current_user is distinct from role_name then
      raise exception 'role did not switch to %', role_name;
    end if;
    if current_setting('request.jwt.claim.sub', true)
       is distinct from '11111111-2222-4333-8444-555555555555' then
      raise exception 'jwt sub was not visible to %', role_name;
    end if;
    execute stmt;
    raise exception 'expected permission denied for % running %', role_name, stmt;
  exception
    when insufficient_privilege then
      null;
  end;
  if current_user is distinct from session_user then
    raise exception 'role stayed as % after %', current_user, stmt;
  end if;
end;
$$;

do $assert_file1$
declare
  rel record;
  col text;
  fn record;
  seq_name text;
  client_grants int;
  missing_service int;
begin
  select count(*) into client_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name like 'fweta\_%' escape '\';
  if client_grants <> 0 then
    raise exception 'anon or authenticated still have % fweta_ table grants', client_grants;
  end if;

  select count(*) into client_grants
  from information_schema.column_privileges
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name like 'fweta\_%' escape '\';
  if client_grants <> 0 then
    raise exception 'anon or authenticated still have % fweta_ column grants', client_grants;
  end if;
  if has_column_privilege('authenticated', 'public.fweta_profiles', 'note', 'SELECT')
     or has_column_privilege('anon', 'public.fweta_profiles', 'note', 'SELECT') then
    raise exception 'column select on fweta_profiles survived file 1';
  end if;

  for seq_name in
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and exists (
        select 1
        from pg_depend d
        join pg_class t on t.oid = d.refobjid
        where d.objid = c.oid
          and d.deptype in ('a', 'i')
          and t.relname like 'fweta\_%' escape '\'
      )
  loop
    if has_sequence_privilege('anon', seq_name, 'USAGE')
       or has_sequence_privilege('anon', seq_name, 'SELECT')
       or has_sequence_privilege('anon', seq_name, 'UPDATE')
       or has_sequence_privilege('authenticated', seq_name, 'USAGE')
       or has_sequence_privilege('authenticated', seq_name, 'SELECT')
       or has_sequence_privilege('authenticated', seq_name, 'UPDATE') then
      raise exception 'client sequence privilege remains on %', seq_name;
    end if;
  end loop;

  for rel in
    select c.oid::regclass as tbl, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname like 'fweta\_%' escape '\'
  loop
    select a.attname into col
    from pg_attribute a
    where a.attrelid = rel.tbl
      and a.attnum > 0
      and not a.attisdropped
      and a.attidentity = ''
      and a.attgenerated = ''
    order by a.attnum
    limit 1;
    if col is null then
      raise exception 'no plain column on % for the update denial check', rel.relname;
    end if;

    perform pg_temp.expect_denied('authenticated', format('select 1 from %s where false', rel.tbl));
    perform pg_temp.expect_denied('authenticated', format('insert into %s default values', rel.tbl));
    perform pg_temp.expect_denied(
      'authenticated',
      format('update %s set %I = %I where false', rel.tbl, col, col)
    );
    perform pg_temp.expect_denied('authenticated', format('delete from %s where false', rel.tbl));
    perform pg_temp.expect_denied('anon', format('select 1 from %s where false', rel.tbl));
    perform pg_temp.expect_denied('anon', format('insert into %s default values', rel.tbl));
    perform pg_temp.expect_denied(
      'anon',
      format('update %s set %I = %I where false', rel.tbl, col, col)
    );
    perform pg_temp.expect_denied('anon', format('delete from %s where false', rel.tbl));
  end loop;

  for fn in
    select p.oid, p.proname, p.pronargs, p.prorettype, p.prokind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'adjust_wallet',
        'fweta_assert_service_role',
        'fweta_json_store_get',
        'fweta_json_store_set',
        'fweta_load_store',
        'fweta_save_store',
        'rls_auto_enable'
      )
  loop
    if has_function_privilege('anon', fn.oid, 'execute')
       or has_function_privilege('authenticated', fn.oid, 'execute') then
      raise exception 'client can still execute %', fn.oid::regprocedure;
    end if;
    if fn.prokind <> 'p'
       and fn.pronargs = 0
       and fn.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype) then
      perform pg_temp.expect_denied('anon', format('select %s', fn.oid::regprocedure));
      perform pg_temp.expect_denied('authenticated', format('select %s', fn.oid::regprocedure));
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fweta_json_store_set'
  ) then
    raise exception 'file 1 dropped fweta_json_store_set';
  end if;

  select count(*) into missing_service
  from service_table_before b
  where not exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.grantee = 'service_role'
      and g.table_name = b.table_name
      and g.privilege_type = b.privilege_type
  );
  if missing_service <> 0 then
    raise exception 'service_role lost % fweta_ table privileges', missing_service;
  end if;

  select count(*) into missing_service
  from service_fn_before b
  where b.allowed
    and not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid::regprocedure::text = b.signature
        and has_function_privilege('service_role', p.oid, 'execute')
    );
  if missing_service <> 0 then
    raise exception 'service_role lost execute on a function it could call';
  end if;

  if not has_table_privilege('anon', 'public.device_locations', 'SELECT')
     or not has_table_privilege('anon', 'public.device_locations', 'INSERT') then
    raise exception 'device_locations anon select or insert was changed';
  end if;
end
$assert_file1$;

-- Web app path: service role reads and writes fweta_app_store and calls the RPCs.
set local role service_role;
insert into public.fweta_app_store (id, data) values ('probe', '{"ok":true}'::jsonb);
select data from public.fweta_app_store where id = 'probe';
update public.fweta_app_store set data = '{"ok":false}'::jsonb where id = 'probe';
delete from public.fweta_app_store where id = 'probe';
select public.fweta_load_store();
select public.fweta_cas_save_store('{"profiles":[]}'::jsonb, 0::bigint);
reset role;

-- QA: a SELECT granted to PUBLIC survived when File 1 revoked only anon
-- and authenticated. Both client roles can use a PUBLIC grant.
create table public.fweta_public_select (id int primary key, note text);
grant select on table public.fweta_public_select to public;
create table public.fweta_public_seq (
  id bigint generated always as identity primary key
);
grant usage, select on sequence public.fweta_public_seq_id_seq to public;
\ir ../migrations/20261026120000_revoke_client_table_grants.sql

do $public_select$
begin
  if has_table_privilege('anon', 'public.fweta_public_select', 'SELECT')
     or has_table_privilege('authenticated', 'public.fweta_public_select', 'SELECT') then
    raise exception 'SELECT granted to PUBLIC on a fweta_ table survived file 1';
  end if;
  if has_sequence_privilege('anon', 'public.fweta_public_seq_id_seq', 'USAGE')
     or has_sequence_privilege('anon', 'public.fweta_public_seq_id_seq', 'SELECT')
     or has_sequence_privilege('authenticated', 'public.fweta_public_seq_id_seq', 'USAGE')
     or has_sequence_privilege('authenticated', 'public.fweta_public_seq_id_seq', 'SELECT') then
    raise exception 'privileges granted to PUBLIC on a fweta_ sequence survived file 1';
  end if;
end
$public_select$;

-- A later grant must not stick. Re-run removes it.
grant execute on function public.fweta_load_store() to anon, authenticated;
\ir ../migrations/20261026120000_revoke_client_table_grants.sql

do $regrant$
begin
  if has_function_privilege('anon', 'public.fweta_load_store()'::regprocedure, 'execute')
     or has_function_privilege('authenticated', 'public.fweta_load_store()'::regprocedure, 'execute') then
    raise exception 're-granted execute on fweta_load_store survived the second run';
  end if;
  if not has_function_privilege('service_role', 'public.fweta_load_store()'::regprocedure, 'execute') then
    raise exception 'service_role lost fweta_load_store on the second run';
  end if;
end
$regrant$;

-- Late fweta_ table, granted as if default privileges had fired, then revoked.
create table public.fweta_late_probe (id int primary key, note text);
grant all privileges on table public.fweta_late_probe to anon, authenticated, service_role;
\ir ../migrations/20261026120000_revoke_client_table_grants.sql

do $late$
begin
  if has_table_privilege('anon', 'public.fweta_late_probe', 'SELECT')
     or has_table_privilege('anon', 'public.fweta_late_probe', 'INSERT')
     or has_table_privilege('anon', 'public.fweta_late_probe', 'UPDATE')
     or has_table_privilege('anon', 'public.fweta_late_probe', 'DELETE')
     or has_table_privilege('authenticated', 'public.fweta_late_probe', 'SELECT')
     or has_table_privilege('authenticated', 'public.fweta_late_probe', 'INSERT')
     or has_table_privilege('authenticated', 'public.fweta_late_probe', 'UPDATE')
     or has_table_privilege('authenticated', 'public.fweta_late_probe', 'DELETE') then
    raise exception 'late fweta_ table still has client privileges';
  end if;
  if not has_table_privilege('service_role', 'public.fweta_late_probe', 'INSERT') then
    raise exception 'service_role lost the late table';
  end if;
end
$late$;

-- Third run stays a no-op.
\ir ../migrations/20261026120000_revoke_client_table_grants.sql

do $final_counts$
declare
  client_grants int;
begin
  select count(*) into client_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name like 'fweta\_%' escape '\';
  if client_grants <> 0 then
    raise exception 'final client fweta_ grant count is %', client_grants;
  end if;
end
$final_counts$;

-- No snapshot: the rollback must raise, and it must not grant execute.
\unset file1_did_not_raise
savepoint file1_no_snapshot;
\set ON_ERROR_STOP off
\ir ../rollbacks/20261026120000_revoke_client_table_grants.down.sql
select 1 as file1_did_not_raise \gset
\set ON_ERROR_STOP on
rollback to savepoint file1_no_snapshot;
\if :{?file1_did_not_raise}
do $file1_should_have_raised$
begin
  raise exception 'file 1 rollback without snapshot did not raise';
end
$file1_should_have_raised$;
\endif

do $rollback_source$
declare
  body text;
begin
  body := lower(pg_read_file('/workspace/supabase/rollbacks/20261026120000_revoke_client_table_grants.down.sql'));
  if position('refusing to restore client grants without the psql variable snapshot' in body) = 0 then
    raise exception 'file 1 rollback does not fail loudly without a snapshot';
  end if;
  if position('grant execute on function' in body) > 0
     or position('grant execute on procedure' in body) > 0
     or position('to public, anon, authenticated' in body) > 0 then
    raise exception 'file 1 rollback still grants execute on fweta_json_store_set';
  end if;
end
$rollback_source$;

do $down_keeps_lock$
declare
  client_grants int;
begin
  select count(*) into client_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name like 'fweta\_%' escape '\';
  if client_grants <> 0 then
    raise exception 'rollback re-opened fweta_ client grants';
  end if;
  if not has_table_privilege('anon', 'public.device_locations', 'SELECT') then
    raise exception 'rollback changed device_locations';
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fweta_json_store_set'
  ) then
    raise exception 'rollback dropped fweta_json_store_set';
  end if;
  if has_function_privilege(
       'public',
       'public.fweta_json_store_set()'::regprocedure,
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.fweta_json_store_set()'::regprocedure,
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.fweta_json_store_set()'::regprocedure,
       'execute'
     ) then
    raise exception 'rollback granted execute on fweta_json_store_set to public, anon, or authenticated';
  end if;
  if has_table_privilege('anon', 'public.fweta_public_select', 'SELECT')
     or has_table_privilege('authenticated', 'public.fweta_public_select', 'SELECT') then
    raise exception 'rollback granted the PUBLIC select back on fweta_public_select';
  end if;
  if has_function_privilege(
       'anon',
       'public.fweta_load_store()'::regprocedure,
       'execute'
     ) then
    raise exception 'rollback restored execute on fweta_load_store';
  end if;
end
$down_keeps_lock$;

rollback;
