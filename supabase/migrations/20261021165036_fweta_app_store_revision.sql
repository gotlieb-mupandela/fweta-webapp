-- Compare-and-swap for the single JSON document in fweta_app_store.
--
-- Warm serverless instances were caching the whole document and upserting it.
-- A later save from a stale copy replaced newer signups and direct SQL edits.
--
-- This migration:
-- 1. Adds revision.
-- 2. Bumps revision on every data change, including a direct SQL edit.
--    The trigger also ignores a writer that tries to set revision backwards.
-- 3. Exposes fweta_cas_save_store to service_role only.
-- 4. Revokes table writes from service_role so the old blind upsert cannot
--    keep overwriting the row. The SQL editor, as table owner, can still edit
--    the row. The trigger records that edit.
--
-- Apply this before deploying the app change. Until that deploy, saves fail
-- instead of replacing the document. Do not re-run
-- 20260830153000_fweta_app_store_grants.sql afterwards. It grants table writes
-- back to service_role.
--
-- Does not change fweta_profiles. Does not edit the security lockdown migration.

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

revoke insert, update, delete, truncate, references, trigger on table public.fweta_app_store from service_role;
grant select on table public.fweta_app_store to service_role;

comment on function public.fweta_cas_save_store(jsonb, bigint) is
  'Service-role compare-and-swap for the fweta_app_store JSON document. Refuses a stale revision so a cached copy cannot replace a newer write or a direct SQL edit.';
