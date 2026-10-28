-- Roll back 20261026130000_store_revision_additive.sql.
-- Drops the bump trigger, fweta_app_store_bump_revision, fweta_cas_save_store,
-- and the revision column. The JSON document in data is kept.
--
-- If 20261026140000_store_revision_revoke_writes.sql is still in effect, roll
-- that file back first. Otherwise service_role cannot write the table and also
-- loses compare-and-swap, so every save fails.
--
-- Idempotent when public.fweta_app_store exists.

do $rollback_a_guard$
begin
  if to_regclass('public.fweta_app_store') is null then
    raise exception 'refusing additive rollback: public.fweta_app_store does not exist';
  end if;

  if not has_table_privilege('service_role', 'public.fweta_app_store', 'insert')
     or not has_table_privilege('service_role', 'public.fweta_app_store', 'update') then
    raise exception 'refusing to drop compare-and-swap while service_role cannot write public.fweta_app_store. Apply supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql first';
  end if;
end
$rollback_a_guard$;

drop trigger if exists fweta_app_store_bump_revision on public.fweta_app_store;
drop function if exists public.fweta_app_store_bump_revision();
drop function if exists public.fweta_cas_save_store(jsonb, bigint);
alter table public.fweta_app_store drop column if exists revision;
