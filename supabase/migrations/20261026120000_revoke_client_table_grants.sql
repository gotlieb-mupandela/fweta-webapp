-- Revoke client privileges on fweta_ tables and on the seven live public functions.
-- Apply this file on its own. It does not change default privileges and it does
-- not touch unprefixed tables. Those are later files.
--
-- Safe on a shared project: the table loop only matches public relations whose
-- names start with fweta_. service_role and postgres keep the grants they
-- already have. The web app reads public.fweta_app_store and calls
-- fweta_cas_save_store, fweta_load_store, and fweta_save_store with the
-- service role. This file does not revoke those.
--
-- Idempotent. Re-running it is safe. It does not require any earlier repo
-- migration, and it does not require a table or column to exist.
--
-- Live export snapshot (the loop is not limited to this list):
--   fweta_app_store, fweta_bookings, fweta_brand_deposits, fweta_campaigns,
--   fweta_fraud_flags, fweta_influencer_profiles, fweta_ledger_entries,
--   fweta_payout_methods, fweta_profiles, fweta_rate_cards, fweta_submissions,
--   fweta_view_snapshots, fweta_wallets, fweta_withdrawal_requests.
-- fweta_linked_accounts is not in that live set. If a fweta_ table is created
-- later, run this file again. New tables can still receive client grants from
-- default privileges until the separate default-privilege file is applied.
--
-- Live public functions this file revokes for anon, authenticated, and public:
--   adjust_wallet, fweta_assert_service_role, fweta_json_store_get,
--   fweta_json_store_set, fweta_load_store, fweta_save_store, rls_auto_enable.
-- On the live database anon and authenticated already cannot execute them, so
-- those revokes are no-ops until a grant is added again. Extension-owned
-- functions are skipped. A missing name is skipped.
--
-- Overlap with PR 28 (branch cursor/security-lockdown-vercel-checks-2c49,
-- file supabase/migrations/20261021100752_security_lockdown.sql, not on main):
-- that file also revokes anon and authenticated on the original fweta_ tables,
-- then grants a subset back to authenticated and adds row policies. This file
-- does not re-grant and does not copy those policies. If PR 28 is applied
-- after this one, its grants give authenticated access back.

do $fweta_revoke$
declare
  rel record;
  seq_name text;
  fn record;
  signature text;
  fn_names text[] := array[
    'adjust_wallet',
    'fweta_assert_service_role',
    'fweta_json_store_get',
    'fweta_json_store_set',
    'fweta_load_store',
    'fweta_save_store',
    'rls_auto_enable'
  ];
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'anon and authenticated roles are required';
  end if;

  for rel in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname like 'fweta\_%' escape '\'
  loop
    execute format(
      'revoke all privileges on table %I.%I from anon, authenticated',
      rel.schema_name,
      rel.table_name
    );
  end loop;

  for seq_name in
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and exists (
        select 1
        from pg_depend d
        join pg_class t on t.oid = d.refobjid
        join pg_namespace tn on tn.oid = t.relnamespace
        where d.objid = c.oid
          and d.deptype in ('a', 'i')
          and tn.nspname = 'public'
          and t.relkind in ('r', 'p')
          and t.relname like 'fweta\_%' escape '\'
      )
  loop
    execute format(
      'revoke all privileges on sequence %s from anon, authenticated',
      seq_name
    );
  end loop;

  for fn in
    select p.oid, p.prokind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (fn_names)
      and not exists (
        select 1
        from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    signature := fn.oid::regprocedure::text;

    -- Keep a service_role execute grant when that role can already call the
    -- function, including when the only grant was to public. anon and
    -- authenticated still lose access. This is a no-op when the explicit
    -- service_role grant is already present.
    if exists (select 1 from pg_roles where rolname = 'service_role')
       and has_function_privilege('service_role', fn.oid, 'execute') then
      if fn.prokind = 'p' then
        execute format('grant execute on procedure %s to service_role', signature);
      else
        execute format('grant execute on function %s to service_role', signature);
      end if;
    end if;

    if fn.prokind = 'p' then
      execute format(
        'revoke all on procedure %s from public, anon, authenticated',
        signature
      );
    else
      execute format(
        'revoke all on function %s from public, anon, authenticated',
        signature
      );
    end if;
  end loop;
end
$fweta_revoke$;

-- OPTIONAL. Commented out on purpose. Not part of the fweta_ revoke.
--
-- public.device_locations exists in the live database. anon can SELECT and
-- INSERT. The table appears in no repo migration, and nothing in main reads
-- or writes it. It may belong to another product sharing this Supabase project.
-- David must confirm no other app uses it before any line below is uncommented.
--
-- Drop the anon SELECT policy and grant first (that is the leak).
-- Do not drop the anon INSERT grant or policy blind, because a device or beacon
-- app may write with the anon key. Replace that write with a server-side write
-- path or an insert-only policy with field checks before removing INSERT.
--
-- do $device$
-- declare
--   pol record;
-- begin
--   if to_regclass('public.device_locations') is null then
--     raise notice 'public.device_locations is absent';
--     return;
--   end if;
--   revoke select on table public.device_locations from anon;
--   for pol in
--     select polname
--     from pg_policy
--     where polrelid = 'public.device_locations'::regclass
--       and polcmd = 'r'
--       and (
--         polroles = '{0}'::oid[]
--         or exists (
--           select 1
--           from pg_roles r
--           where r.rolname = 'anon'
--             and r.oid = any (polroles)
--         )
--       )
--   loop
--     execute format('drop policy %I on public.device_locations', pol.polname);
--   end loop;
-- end
-- $device$;
