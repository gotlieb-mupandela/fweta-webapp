-- fweta: make a store revision conflict a plain error that PostgREST does not retry.
--
-- fweta_cas_save_store raised 'fweta_store_conflict' with SQLSTATE 40001
-- (serialization_failure). PostgREST 12 retries a transaction that fails with
-- 40001, and a stale expected_revision fails the same way on every retry, so
-- the request never returns. Local proof (29 Oct 2026, PostgREST 12.2.3): one
-- RPC call with a stale revision hung until the client gave up, while Postgres
-- logged about 2000 rollbacks a second. One hung save also blocks every later
-- write on that server instance, because writes are queued per instance.
--
-- SQLSTATE PT409 makes PostgREST answer HTTP 409 at once. The app treats any
-- error whose message contains 'fweta_store_conflict' as a conflict, reloads,
-- and retries with the fresh revision.
--
-- Same function body and grants as 20261021165036, only the conflict code changes.
-- Needs Gotlieb's OK before it is applied to any hosted project.

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
        using errcode = 'PT409';
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
        using errcode = 'PT409';
    end if;

    return new_revision;
  end if;

  if expected_revision is null
     or existing_revision is distinct from expected_revision then
    raise exception 'fweta_store_conflict'
      using errcode = 'PT409';
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
      using errcode = 'PT409';
  end if;

  return new_revision;
end;
$$;

revoke all on function public.fweta_cas_save_store(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.fweta_cas_save_store(jsonb, bigint) to service_role;
