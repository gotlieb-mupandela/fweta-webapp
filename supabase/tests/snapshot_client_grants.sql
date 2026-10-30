-- Snapshot, apply file 1, replay the snapshot through the file 1 rollback,
-- and check the catalog grants match the original.
-- The transaction is rolled back. Nothing is committed.
--
-- The operator creates a private directory by hand with mktemp -d and
-- chmod 700, and passes it as snapdir.
-- mktemp -d creates the directory. chmod 700 keeps it private.
-- pg_read_file reads the snapshot files on the database server, so the
-- server OS user must be able to read that directory. Create the
-- directory as that user. Do not widen the mode.
--
--   snapdir=$(mktemp -d)
--   chmod 700 "$snapdir"
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v snapdir="$snapdir" \
--     -f supabase/tests/snapshot_client_grants.sql

\set ON_ERROR_STOP on

\if :{?snapdir}
\else
\echo 'Refusing snapshot test: pass snapdir, a private directory from mktemp -d and chmod 700. The database server must be able to read it.'
do $missing_snapdir$
begin
  raise exception 'snapdir is not set';
end
$missing_snapdir$;
\endif

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

create table public.fweta_app_store (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table public.fweta_campaigns (
  id int primary key,
  note text
);

create table public.fweta_seq (
  id bigint generated always as identity primary key
);

create table public.bookings (
  id bigint generated always as identity primary key,
  note text
);

create table public.device_locations (
  id int primary key
);

create function public.fweta_json_store_set()
returns void
language plpgsql
security definer
set search_path = public
as $body$
begin
  return;
end
$body$;

create function public.fweta_load_store()
returns jsonb
language sql
stable
as $$ select '{}'::jsonb $$;

-- Explicit service_role execute, so file 1's preservation grant is a no-op
-- and the catalog comparison is exact. On a function where service_role can
-- execute only through PUBLIC, file 1 adds an explicit service_role EXECUTE
-- and the snapshot replay still puts PUBLIC back.
do $keep_service_role$
declare
  fn record;
begin
  for fn in
    select p.oid, p.prokind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    if has_function_privilege('service_role', fn.oid, 'execute') then
      if fn.prokind = 'p' then
        execute format('grant execute on procedure %s to service_role', fn.oid::regprocedure);
      else
        execute format('grant execute on function %s to service_role', fn.oid::regprocedure);
      end if;
    end if;
  end loop;
end
$keep_service_role$;

grant select, insert, update, delete on table public.fweta_app_store to service_role;
grant select, insert, update on table public.fweta_campaigns to authenticated;
grant select on table public.fweta_campaigns to anon;
grant delete on table public.fweta_campaigns to authenticated with grant option;
grant select, insert, update, delete on table public.fweta_seq to anon, authenticated;
grant select, insert, update, delete on table public.fweta_seq to service_role;
grant usage, select, update on sequence public.fweta_seq_id_seq to anon, authenticated;
grant usage, select, update on sequence public.fweta_seq_id_seq to service_role;
grant select, insert, update, delete on table public.bookings to authenticated;
grant select on table public.bookings to anon;
grant select, insert on table public.device_locations to anon;
grant execute on function public.fweta_json_store_set() to public, anon, authenticated;

create table public.fweta_profiles (
  id int primary key,
  email text,
  display_name text
);
grant select (email, display_name) on table public.fweta_profiles to authenticated;
revoke all on function public.fweta_load_store() from public;

alter default privileges for role postgres in schema public
  grant select on tables to authenticated;
alter default privileges for role postgres
  grant execute on functions to public;

create function pg_temp.client_acl()
returns table (
  kind text,
  obj text,
  grantee text,
  privilege_type text,
  is_grantable boolean
)
language sql
as $$
  select
    'table',
    format('%I.%I', n.nspname, c.relname),
    case when a.grantee = 0 then 'public' else r.rolname end,
    a.privilege_type,
    a.is_grantable
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  select
    'column',
    format('%I.%I.%I', n.nspname, c.relname, att.attname),
    case when a.grantee = 0 then 'public' else r.rolname end,
    a.privilege_type,
    a.is_grantable
  from pg_attribute att
  join pg_class c on c.oid = att.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(att.attacl) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and att.attnum > 0
    and not att.attisdropped
    and att.attacl is not null
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  select
    'sequence',
    format('%I.%I', n.nspname, c.relname),
    case when a.grantee = 0 then 'public' else r.rolname end,
    a.privilege_type,
    a.is_grantable
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public'
    and c.relkind = 'S'
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  select
    'function',
    format(
      '%I.%I(%s)',
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ),
    case when a.grantee = 0 then 'public' else r.rolname end,
    a.privilege_type,
    a.is_grantable
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public'
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  select
    'default',
    format(
      '%s/%s/%s',
      owner_role.rolname,
      case when d.defaclnamespace = 0 then '' else n.nspname end,
      d.defaclobjtype
    ),
    case when a.grantee = 0 then 'public' else r.rolname end,
    a.privilege_type,
    a.is_grantable
  from pg_default_acl d
  join pg_roles owner_role on owner_role.oid = d.defaclrole
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  left join pg_roles r on r.oid = a.grantee
  where (d.defaclnamespace = 0 or n.nspname = 'public')
    and d.defaclobjtype in ('r', 'S', 'f', 'T', 'n')
    and not (d.defaclobjtype = 'n' and d.defaclnamespace <> 0)
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
$$;

create temp table before_acl as
select kind, obj, grantee, privilege_type, is_grantable
from pg_temp.client_acl();

\set snap_file :snapdir '/fweta-client-grants.snapshot.sql'
\set snap_again :snapdir '/fweta-client-grants.snapshot.again.sql'
\o :snap_file
\ir ../../scripts/ops/snapshot-client-grants.sql
\o
\o :snap_again
\ir ../../scripts/ops/snapshot-client-grants.sql
\o

\pset tuples_only off
\pset format aligned
\pset footer on

-- psql substitutes :'snap_file' in this statement. It does not substitute
-- inside the dollar-quoted block below. pg_read_file runs on the database
-- server, which must be able to read snapdir.
create temp table snapshot_output (
  label text primary key,
  contents text not null
);

insert into snapshot_output (label, contents) values
  ('body', pg_read_file(:'snap_file')),
  ('again', pg_read_file(:'snap_again'));

do $snapshot_file$
declare
  body text;
  again text;
begin
  select contents into body from snapshot_output where label = 'body';
  select contents into again from snapshot_output where label = 'again';
  if body is distinct from again then
    raise exception 'snapshot output is not deterministic';
  end if;
  if position('grant select on table public.fweta_campaigns to anon;' in body) = 0 then
    raise exception 'snapshot missed anon select on fweta_campaigns';
  end if;
  if position('grant delete on table public.fweta_campaigns to authenticated with grant option;' in body) = 0 then
    raise exception 'snapshot missed grant option on fweta_campaigns';
  end if;
  if position('grant select on table public.fweta_app_store to service_role;' in body) = 0 then
    raise exception 'snapshot missed service_role on fweta_app_store';
  end if;
  if position('grant usage on sequence public.fweta_seq_id_seq to anon;' in body) = 0 then
    raise exception 'snapshot missed anon usage on fweta_seq_id_seq';
  end if;
  if position('grant execute on function public.fweta_json_store_set() to public;' in body) = 0 then
    raise exception 'snapshot missed public execute on fweta_json_store_set';
  end if;
  if position('grant execute on function public.fweta_json_store_set() to anon;' in body) = 0 then
    raise exception 'snapshot missed anon execute on fweta_json_store_set';
  end if;
  if position('alter default privileges for role postgres in schema public grant select on tables to authenticated;' in body) = 0 then
    raise exception 'snapshot missed schema default privilege';
  end if;
  if position('alter default privileges for role postgres grant execute on functions to public;' in body) = 0 then
    raise exception 'snapshot missed global function default privilege';
  end if;
  if position('grant select (display_name, email) on table public.fweta_profiles to authenticated;' in body) = 0 then
    raise exception 'snapshot missed authenticated column select on fweta_profiles';
  end if;
  if position('revoke ' in body) > 0 then
    raise exception 'snapshot must be grants only';
  end if;
end
$snapshot_file$;

\ir ../migrations/20261026120000_revoke_client_table_grants.sql

do $revoked$
begin
  if exists (
    select 1
    from pg_temp.client_acl()
    where grantee in ('anon', 'authenticated', 'public')
      and (
        (kind in ('table', 'sequence', 'column') and obj like 'public.fweta\_%' escape '\')
        or obj = 'public.fweta_json_store_set()'
        or obj = 'public.fweta_load_store()'
      )
  ) then
    raise exception 'file 1 left a client grant on a fweta_ object';
  end if;

  if has_column_privilege('authenticated', 'public.fweta_profiles', 'email', 'select')
     or has_column_privilege('authenticated', 'public.fweta_profiles', 'display_name', 'select') then
    raise exception 'file 1 left a column select on fweta_profiles';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fweta_json_store_set'
  ) then
    raise exception 'file 1 dropped fweta_json_store_set';
  end if;

  if not has_table_privilege('service_role', 'public.fweta_app_store', 'select') then
    raise exception 'file 1 removed service_role from fweta_app_store';
  end if;

  if not has_table_privilege('anon', 'public.device_locations', 'select')
     or not has_table_privilege('anon', 'public.device_locations', 'insert') then
    raise exception 'file 1 changed device_locations';
  end if;

  if not has_table_privilege('anon', 'public.bookings', 'select') then
    raise exception 'file 1 changed unprefixed bookings';
  end if;
end
$revoked$;

\set snapshot :snap_file
\ir ../rollbacks/20261026120000_revoke_client_table_grants.down.sql

create temp table after_acl as
select kind, obj, grantee, privilege_type, is_grantable
from pg_temp.client_acl();

do $match$
declare
  missing text;
  extra text;
begin
  select string_agg(format('%s %s %s %s grantable=%s', kind, obj, grantee, privilege_type, is_grantable), '; ')
  into missing
  from (
    select * from before_acl
    except
    select * from after_acl
  ) gap;

  select string_agg(format('%s %s %s %s grantable=%s', kind, obj, grantee, privilege_type, is_grantable), '; ')
  into extra
  from (
    select * from after_acl
    except
    select * from before_acl
  ) gap;

  if missing is not null or extra is not null then
    raise exception 'grants do not match after snapshot replay. missing: %. extra: %',
      coalesce(missing, 'none'),
      coalesce(extra, 'none');
  end if;

  if not has_function_privilege('anon', 'public.fweta_json_store_set()', 'execute')
     or not has_function_privilege('authenticated', 'public.fweta_json_store_set()', 'execute')
     or not exists (
       select 1
       from after_acl
       where obj = 'public.fweta_json_store_set()'
         and grantee = 'public'
         and privilege_type = 'EXECUTE'
     ) then
    raise exception 'snapshot replay did not restore fweta_json_store_set execute';
  end if;

  if not has_column_privilege('authenticated', 'public.fweta_profiles', 'email', 'select')
     or not has_column_privilege('authenticated', 'public.fweta_profiles', 'display_name', 'select') then
    raise exception 'snapshot replay did not restore fweta_profiles column select';
  end if;
  if has_table_privilege('authenticated', 'public.fweta_profiles', 'select') then
    raise exception 'snapshot replay turned a column grant into table select';
  end if;
end
$match$;

rollback;
