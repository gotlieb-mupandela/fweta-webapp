\ir 00_guard.sql

-- Rehearsal-only helpers. Not part of the app schema.

create schema if not exists rehearsal;

create or replace function rehearsal.ok(cond boolean, label text)
returns void
language plpgsql
as $$
begin
  if coalesce(cond, false) then
    raise notice 'ok: %', label;
  else
    raise exception 'assertion failed: %', label;
  end if;
end
$$;

-- Run one statement as role_name with request.jwt.claims set.
-- Returns 'ok' or '<sqlstate> <message>'. The caller's role is unchanged.
create or replace function rehearsal.exec_as(role_name text, claims text, stmt text)
returns text
language plpgsql
security invoker
as $$
begin
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  execute format('set local role %I', role_name);
  execute stmt;
  return 'ok';
exception
  when others then
    return sqlstate || ' ' || sqlerrm;
end
$$;

create table if not exists rehearsal.scratch (
  id text primary key,
  result text
);

-- Direct service_role grants on one table, sorted. Does not include privileges
-- inherited through PUBLIC. MAINTAIN appears here only when the server has it
-- and the role holds it.
create or replace function rehearsal.service_role_table_privs(rel regclass)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select string_agg(
      x.privilege_type || case when x.is_grantable then ':grant' else '' end,
      ',' order by x.privilege_type
    )
    from pg_catalog.aclexplode((
      select c.relacl from pg_catalog.pg_class c where c.oid = rel
    )) as x
    where x.grantee = (
      select r.oid from pg_catalog.pg_roles r where r.rolname = 'service_role'
    )
  ), '')
$$;

-- True when this server has MAINTAIN and service_role does not hold it,
-- or when this server has no MAINTAIN privilege.
create or replace function rehearsal.service_role_lacks_maintain(rel regclass)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if current_setting('server_version_num')::int < 170000 then
    return true;
  end if;
  return not has_table_privilege('service_role', rel, 'maintain');
end
$$;

grant usage on schema rehearsal to service_role, anon, authenticated;
grant select, insert, update, delete on rehearsal.scratch to service_role, anon, authenticated;
