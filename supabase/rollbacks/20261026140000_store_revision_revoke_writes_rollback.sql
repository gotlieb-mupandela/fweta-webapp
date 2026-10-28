-- Roll back 20261026140000_store_revision_revoke_writes.sql.
-- Restores service_role on public.fweta_app_store to the pre-revoke baseline.
-- The revoke removes INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER.
-- SELECT stays. PostgreSQL 17 and newer also have MAINTAIN in GRANT ALL, and
-- the revoke removes that too, so this file grants it back on those servers.
-- The resulting direct grants are DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
-- TRUNCATE, UPDATE, and MAINTAIN when that privilege exists.
--
-- Does not remove revision, the bump trigger, or fweta_cas_save_store.
-- If public.fweta_json_store_set(jsonb) exists, grants execute back to
-- service_role only. Does not grant it to public, anon, or authenticated.
-- Idempotent.

grant select, insert, update, delete, truncate, references, trigger
  on table public.fweta_app_store to service_role;

do $grant_maintain$
begin
  if current_setting('server_version_num')::int < 170000 then
    return;
  end if;
  execute 'grant maintain on table public.fweta_app_store to service_role';
end
$grant_maintain$;

do $restore_json_store_set$
begin
  if to_regprocedure('public.fweta_json_store_set(jsonb)') is null then
    raise notice 'fweta_json_store_set(jsonb) is absent; execute grant skipped';
    return;
  end if;

  grant execute on function public.fweta_json_store_set(jsonb) to service_role;
  raise notice 'granted execute on fweta_json_store_set(jsonb) to service_role only';
end
$restore_json_store_set$;
