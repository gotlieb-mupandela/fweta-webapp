-- Rollback for 20261026120000_revoke_client_table_grants.sql
--
-- Re-granting anon or authenticated access re-opens the exposure. This file
-- does not do that.
--
-- Derived from the migrations on main, not guessed:
-- No migration grants table privileges on fweta_ tables to anon or authenticated.
-- No migration grants execute on adjust_wallet, fweta_assert_service_role,
-- fweta_json_store_get, fweta_json_store_set, fweta_load_store, fweta_save_store,
-- or rls_auto_enable to anon or authenticated.
-- The repo grants execute to service_role only, on fweta_load_store(),
-- fweta_save_store(jsonb), and fweta_cas_save_store(jsonb, bigint).
-- fweta_cas_save_store is not one of the seven live functions and the forward
-- file does not revoke it. service_role table grants are not removed either,
-- including access to fweta_app_store, so there is nothing to put back.
--
-- Live anon and authenticated already cannot execute the other six functions.
-- Restoring execute for them would re-open that exposure and is not done here.
--
-- fweta_json_store_set is different. The forward file revokes execute from
-- public, anon, and authenticated. The block below grants those three back.
-- That re-opens the exposure: the live function is security definer, has no
-- JWT role check, and bypasses the revision check. The function is not
-- dropped. Dropping it should wait until after main is deployed.
-- service_role was not revoked, so this file does not change it.

do $fweta_revoke_down$
begin
  raise notice 'No anon or authenticated table grants from repo migrations to restore. service_role was not revoked.';
end
$fweta_revoke_down$;

do $json_store_set_down$
declare
  fn record;
  signature text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'anon and authenticated roles are required';
  end if;

  for fn in
    select p.oid, p.prokind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fweta_json_store_set'
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    signature := fn.oid::regprocedure::text;
    if fn.prokind = 'p' then
      execute format(
        'grant execute on procedure %s to public, anon, authenticated',
        signature
      );
    else
      execute format(
        'grant execute on function %s to public, anon, authenticated',
        signature
      );
    end if;
  end loop;
end
$json_store_set_down$;

-- OPTIONAL device_locations rollback. Commented out, same as the forward file.
-- Uncommenting the grant below re-opens the anon SELECT leak.
-- The forward file does not remove INSERT, so this file does not grant INSERT.
-- Policy text is not in this repo, so dropped policies cannot be rebuilt here.
-- David must confirm no other app uses public.device_locations first.
-- There is no repo migration for device_locations and nothing in main uses it.
--
-- grant select on table public.device_locations to anon;
