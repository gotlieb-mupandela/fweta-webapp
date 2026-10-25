-- Revoke direct table writes on fweta_app_store from service_role.
--
-- Apply only after both of these are true:
-- 1. 20261026130000_store_revision_additive.sql has been applied.
-- 2. The new build is deployed and a save through fweta_cas_save_store has been verified.
--
-- An older build upserts public.fweta_app_store directly. After this file that
-- upsert fails with permission denied, so every save from the old build fails.
-- SELECT stays, so the service role can still read the document.
-- fweta_cas_save_store is security definer and keeps writing as its owner.
--
-- This file does not drop revision, the bump trigger, or fweta_cas_save_store.
-- Idempotent.
--
-- Do not execute 20261021165036_fweta_app_store_revision.sql as well.
-- Do not re-run 20260830153000_fweta_app_store_grants.sql after this file.
-- That file grants table writes back to service_role.

do $revoke_guard$
begin
  if to_regprocedure('public.fweta_cas_save_store(jsonb, bigint)') is null then
    raise exception 'refusing to revoke fweta_app_store writes: public.fweta_cas_save_store(jsonb, bigint) is not installed. Apply 20261026130000_store_revision_additive.sql first';
  end if;

  if not exists (
    select 1
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'fweta_app_store'
      and a.attname = 'revision'
      and not a.attisdropped
  ) then
    raise exception 'refusing to revoke fweta_app_store writes: revision column is missing. Apply 20261026130000_store_revision_additive.sql first';
  end if;
end
$revoke_guard$;

revoke insert, update, delete, truncate, references, trigger on table public.fweta_app_store from service_role;
grant select on table public.fweta_app_store to service_role;
