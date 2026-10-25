-- Roll back 20261026140000_store_revision_revoke_writes.sql.
-- Grants insert, update, and delete on public.fweta_app_store back to service_role
-- so an older build can upsert again.
--
-- Does not grant truncate, references, or trigger. The revoke step removed those
-- as well. The old upsert uses insert and update only.
-- Does not remove revision, the bump trigger, or fweta_cas_save_store.
-- If public.fweta_json_store_set(jsonb) exists, grants execute back to
-- service_role only. Does not grant it to public, anon, or authenticated.
-- Idempotent.

grant insert, update, delete on table public.fweta_app_store to service_role;

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
