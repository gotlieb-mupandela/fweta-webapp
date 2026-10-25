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

grant usage on schema rehearsal to service_role, anon, authenticated;
grant select, insert, update, delete on rehearsal.scratch to service_role, anon, authenticated;
