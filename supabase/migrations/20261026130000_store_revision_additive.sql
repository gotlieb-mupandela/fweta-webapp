-- Additive half of the fweta_app_store revision change.
-- Safe while an older build is still serving.
--
-- The live build writes with a plain upsert of id, data, and updated_at.
-- This file:
-- 1. Adds revision. Existing rows read as 0.
-- 2. Bumps revision on every real data change, including that upsert and a
--    direct SQL edit. A writer that sets revision itself is ignored.
-- 3. Adds fweta_cas_save_store and grants execute to service_role only.
--
-- It does not revoke table writes. The old upsert keeps working, and the
-- trigger still bumps revision. Execute on the bump function is revoked from
-- the API roles, including service_role. PostgreSQL still runs an existing
-- trigger without that grant. A direct call of the bump function is denied.
--
-- Apply 20261026140000_store_revision_revoke_writes.sql only after the new
-- build is deployed and a compare-and-swap save has been verified.
--
-- Do not also execute 20261021165036_fweta_app_store_revision.sql.
-- That file revokes table writes in the same step as these objects.
-- If a runner applies every file under supabase/migrations in timestamp order,
-- it will run that older file first and the current build will fail every save.
--
-- Idempotent. Does not change fweta_profiles. Does not edit the lockdown migration.
-- Does not grant or revoke table insert, update, or delete.

alter table public.fweta_app_store
  add column if not exists revision bigint not null default 0;

comment on column public.fweta_app_store.revision is
  'Incremented by trigger whenever data changes, including direct SQL edits. App saves must compare-and-swap on this value.';

create or replace function public.fweta_app_store_bump_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
    if NEW.updated_at is null then
      NEW.updated_at := now();
    end if;
    return NEW;
  end if;

  -- Any real change, including a SQL editor edit, moves the version forward.
  -- A save that still holds the previous version then reloads instead of
  -- writing its cached copy over this row.
  if NEW.data is distinct from OLD.data then
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := now();
  else
    NEW.revision := OLD.revision;
  end if;
  return NEW;
end;
$$;

drop trigger if exists fweta_app_store_bump_revision on public.fweta_app_store;

create trigger fweta_app_store_bump_revision
before insert or update on public.fweta_app_store
for each row
execute function public.fweta_app_store_bump_revision();

create or replace function public.fweta_cas_save_store(
  payload jsonb,
  expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_revision bigint;
  current_data jsonb;
  new_revision bigint;
begin
  -- Same gate as the lockdown store RPCs. auth.role() reads the JWT, so a
  -- security definer owner cannot be reached with the anon key.
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'fweta store RPCs are limited to the service role'
      using errcode = '42501';
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'fweta store payload must be a JSON object'
      using errcode = '22023';
  end if;

  select revision, data
  into existing_revision, current_data
  from public.fweta_app_store
  where id = 'default'
  for update;

  if not found then
    if expected_revision is not null then
      raise exception 'fweta_store_conflict'
        using errcode = '40001';
    end if;

    if jsonb_array_length(coalesce(payload->'profiles', '[]'::jsonb)) = 0 then
      raise exception 'refusing to insert an empty fweta store'
        using errcode = '23514';
    end if;

    insert into public.fweta_app_store (id, data, updated_at)
    values ('default', payload, now())
    on conflict (id) do nothing
    returning revision into new_revision;

    if new_revision is null then
      raise exception 'fweta_store_conflict'
        using errcode = '40001';
    end if;

    return new_revision;
  end if;

  if expected_revision is null
     or existing_revision is distinct from expected_revision then
    raise exception 'fweta_store_conflict'
      using errcode = '40001';
  end if;

  if jsonb_array_length(coalesce(payload->'profiles', '[]'::jsonb)) = 0
     and jsonb_array_length(coalesce(current_data->'profiles', '[]'::jsonb)) > 0 then
    raise exception 'refusing to replace a populated store with an empty profile list'
      using errcode = '23514';
  end if;

  update public.fweta_app_store
  set data = payload,
      updated_at = now()
  where id = 'default'
    and revision = expected_revision
  returning revision into new_revision;

  if new_revision is null then
    raise exception 'fweta_store_conflict'
      using errcode = '40001';
  end if;

  return new_revision;
end;
$$;

revoke all on function public.fweta_app_store_bump_revision() from public, anon, authenticated, service_role;
revoke all on function public.fweta_cas_save_store(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.fweta_cas_save_store(jsonb, bigint) to service_role;

comment on function public.fweta_cas_save_store(jsonb, bigint) is
  'Service-role compare-and-swap for the fweta_app_store JSON document. Refuses a stale revision so a cached copy cannot replace a newer write or a direct SQL edit.';
