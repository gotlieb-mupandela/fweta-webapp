-- APPLY ONLY AFTER David confirms with Gotlieb that these tables belong to
-- Fweta only, and after the live export shows which app writes to each.
-- Confirm against the live export in /workspace/fweta-qa/prod-schema/ before apply.
--
-- Unprefixed public tables. This file is separate from the fweta_ revoke
-- because these relations may belong to another product on the same project.
-- Each name is skipped when that table is absent. device_locations is not
-- in this list. fweta_ tables are not touched.
--
-- Idempotent. Does not assume any repo migration ran, and does not read
-- columns. Privileges on the matched tables and sequences are revoked from
-- public as well as from anon and authenticated. A grant to public is not
-- removed by revoking only those two roles, and both client roles can use
-- it. service_role and postgres keep the explicit grants they already have.
-- A privilege that exists only as a grant to public is removed for every role.

do $unprefixed_revoke$
declare
  table_name text;
  relkind "char";
  seq_name text;
  names text[] := array[
    'bookings',
    'brand_deposits',
    'campaigns',
    'fraud_flags',
    'influencer_profiles',
    'ledger_entries',
    'payout_methods',
    'profiles',
    'rate_cards',
    'submissions',
    'view_snapshots',
    'wallets',
    'withdrawal_requests'
  ];
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'anon and authenticated roles are required';
  end if;

  foreach table_name in array names loop
    relkind := null;
    select c.relkind into relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = table_name
      and c.relkind in ('r', 'p');

    if relkind is null then
      raise notice 'skipping public.% because that table is not present', table_name;
      continue;
    end if;

    execute format(
      'revoke all privileges on table public.%I from public, anon, authenticated',
      table_name
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
          and t.relname = any (names)
      )
  loop
    execute format(
      'revoke all privileges on sequence %s from public, anon, authenticated',
      seq_name
    );
  end loop;
end
$unprefixed_revoke$;
