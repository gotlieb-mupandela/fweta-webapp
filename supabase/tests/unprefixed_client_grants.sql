-- File 2 privilege test. Throwaway database, one transaction, rolled back:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/unprefixed_client_grants.sql
-- view_snapshots is created only after the first run, to prove a missing
-- name does not abort the file.

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

do $fixture$
declare
  name text;
  names text[] := array[
    'bookings',
    'brand_deposits',
    'campaigns',
    'fraud_flags',
    'influencer_profiles',
    'ledger_entries',
    'payout_methods',
    'profiles',
    'rate_cards',
    'submissions',
    'wallets',
    'withdrawal_requests'
  ];
begin
  if to_regclass('public.bookings') is null then
    create table public.bookings (
      id bigint generated always as identity primary key,
      note text
    );
  end if;

  foreach name in array names loop
    if name = 'bookings' then
      continue;
    end if;
    if to_regclass('public.' || name) is null then
      execute format('create table public.%I (id int primary key, note text)', name);
    end if;
  end loop;

  if to_regclass('public.fweta_app_store') is null then
    create table public.fweta_app_store (id int primary key, note text);
  end if;
  if to_regclass('public.device_locations') is null then
    create table public.device_locations (id int primary key, note text);
  end if;
end
$fixture$;

do $leak$
declare
  name text;
  names text[] := array[
    'bookings',
    'brand_deposits',
    'campaigns',
    'fraud_flags',
    'influencer_profiles',
    'ledger_entries',
    'payout_methods',
    'profiles',
    'rate_cards',
    'submissions',
    'wallets',
    'withdrawal_requests'
  ];
  seq_name text;
begin
  foreach name in array names loop
    execute format(
      'grant all privileges on table public.%I to anon, authenticated, service_role',
      name
    );
    execute format('grant select (note) on table public.%I to anon', name);
  end loop;

  for seq_name in
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format(
      'grant all privileges on sequence %s to anon, authenticated, service_role',
      seq_name
    );
  end loop;

  grant select on table public.fweta_app_store to anon;
  grant select, insert on table public.device_locations to anon;
end
$leak$;

create temp table service_before as
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'service_role'
  and table_name in (
    'bookings', 'brand_deposits', 'campaigns', 'fraud_flags',
    'influencer_profiles', 'ledger_entries', 'payout_methods', 'profiles',
    'rate_cards', 'submissions', 'wallets', 'withdrawal_requests'
  );

\ir ../migrations/20261026120100_revoke_unprefixed_client_grants.sql

do $assert_present$
declare
  name text;
  names text[] := array[
    'bookings',
    'brand_deposits',
    'campaigns',
    'fraud_flags',
    'influencer_profiles',
    'ledger_entries',
    'payout_methods',
    'profiles',
    'rate_cards',
    'submissions',
    'wallets',
    'withdrawal_requests'
  ];
  seq_name text;
  n int;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name = any (names);
  if n <> 0 then
    raise exception 'client table grants remain on the unprefixed list: %', n;
  end if;

  select count(*) into n
  from information_schema.column_privileges
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name = any (names);
  if n <> 0 then
    raise exception 'client column grants remain on the unprefixed list: %', n;
  end if;

  foreach name in array names loop
    if has_table_privilege('anon', format('public.%I', name), 'SELECT')
       or has_table_privilege('anon', format('public.%I', name), 'INSERT')
       or has_table_privilege('anon', format('public.%I', name), 'UPDATE')
       or has_table_privilege('anon', format('public.%I', name), 'DELETE')
       or has_table_privilege('authenticated', format('public.%I', name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I', name), 'INSERT')
       or has_table_privilege('authenticated', format('public.%I', name), 'UPDATE')
       or has_table_privilege('authenticated', format('public.%I', name), 'DELETE') then
      raise exception 'client privilege remains on %', name;
    end if;
  end loop;

  for seq_name in
    select pg_get_serial_sequence('public.bookings', 'id')
  loop
    if seq_name is null then
      raise exception 'bookings identity sequence was not found';
    end if;
    if has_sequence_privilege('anon', seq_name, 'USAGE')
       or has_sequence_privilege('authenticated', seq_name, 'USAGE') then
      raise exception 'client sequence privilege remains on %', seq_name;
    end if;
    if not has_sequence_privilege('service_role', seq_name, 'USAGE') then
      raise exception 'service_role lost the bookings sequence';
    end if;
  end loop;

  select count(*) into n
  from service_before b
  where not exists (
    select 1
    from information_schema.role_table_grants g
    where g.grantee = 'service_role'
      and g.table_schema = 'public'
      and g.table_name = b.table_name
      and g.privilege_type = b.privilege_type
  );
  if n <> 0 then
    raise exception 'service_role lost % unprefixed privileges', n;
  end if;

  if not has_table_privilege('anon', 'public.fweta_app_store', 'SELECT') then
    raise exception 'file 2 revoked a fweta_ table';
  end if;
  if not has_table_privilege('anon', 'public.device_locations', 'SELECT')
     or not has_table_privilege('anon', 'public.device_locations', 'INSERT') then
    raise exception 'file 2 changed device_locations';
  end if;
end
$assert_present$;

-- Missing name, then a second run after it exists.
create table public.view_snapshots (id int primary key, note text);
grant all privileges on table public.view_snapshots to anon, authenticated, service_role;
\ir ../migrations/20261026120100_revoke_unprefixed_client_grants.sql

do $view_snapshots$
begin
  if has_table_privilege('anon', 'public.view_snapshots', 'SELECT')
     or has_table_privilege('authenticated', 'public.view_snapshots', 'INSERT') then
    raise exception 'view_snapshots still has a client privilege';
  end if;
  if not has_table_privilege('service_role', 'public.view_snapshots', 'DELETE') then
    raise exception 'service_role lost view_snapshots';
  end if;
end
$view_snapshots$;

\unset file2_did_not_raise
savepoint file2_no_snapshot;
\set ON_ERROR_STOP off
\ir ../rollbacks/20261026120100_revoke_unprefixed_client_grants.down.sql
select 1 as file2_did_not_raise \gset
\set ON_ERROR_STOP on
rollback to savepoint file2_no_snapshot;
\if :{?file2_did_not_raise}
do $file2_should_have_raised$
begin
  raise exception 'file 2 rollback without snapshot did not raise';
end
$file2_should_have_raised$;
\endif

do $down$
declare
  n int;
begin
  select count(*) into n
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and table_name in (
      'bookings', 'brand_deposits', 'campaigns', 'fraud_flags',
      'influencer_profiles', 'ledger_entries', 'payout_methods', 'profiles',
      'rate_cards', 'submissions', 'view_snapshots', 'wallets',
      'withdrawal_requests'
    );
  if n <> 0 then
    raise exception 'unprefixed rollback re-opened client grants';
  end if;
end
$down$;

rollback;
