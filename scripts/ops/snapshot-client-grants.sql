-- Read only. Prints a replayable GRANT script for the current database.
-- Run this and save the output BEFORE applying the client-grant revokes.
-- It does not GRANT, REVOKE, or write catalog rows.
--
-- From the repo root:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/ops/snapshot-client-grants.sql \
--     -o /tmp/fweta-client-grants.snapshot.sql
--
-- Sources, via aclexplode:
--   pg_class tables and views (relkind r, p, v, m, f) in schema public
--   pg_class sequences (relkind S) in schema public
--   pg_proc functions and procedures in schema public
--   pg_default_acl for schema public, plus global default privileges
--     (defaclnamespace 0). Global defaults apply to objects created in
--     public, and file 3 revokes the global function default.
--     When postgres or supabase_admin has no global function row, PUBLIC
--     execute is still the built-in default. The script emits that GRANT
--     so a later revoke can be reversed. Replaying it while the built-in
--     default is already in effect does not create a row.
--
-- Grantees: anon, authenticated, service_role, and PUBLIC.
-- A null ACL is expanded with acldefault, so a function that is executable
-- by PUBLIC only because proacl is null is still recorded.
-- Column-only grants in pg_attribute.attacl are not recorded.
--
-- Replay the saved file through a rollback (see the .down.sql headers),
-- or with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /tmp/fweta-client-grants.snapshot.sql

\pset tuples_only on
\pset format unaligned
\pset footer off
\pset columns 0

select line
from (
  select
    0 as sort_key,
    '-- client grant snapshot. replay this file to put these grants back.' as line

  union all

  select
    1,
    format(
      'grant %s on table %I.%I to %s%s;',
      lower(a.privilege_type),
      n.nspname,
      c.relname,
      case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end,
      case when a.is_grantable then ' with grant option' else '' end
    )
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  select
    2,
    format(
      'grant %s on sequence %I.%I to %s%s;',
      lower(a.privilege_type),
      n.nspname,
      c.relname,
      case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end,
      case when a.is_grantable then ' with grant option' else '' end
    )
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public'
    and c.relkind = 'S'
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  select
    3,
    format(
      'grant %s on %s %I.%I(%s) to %s%s;',
      lower(a.privilege_type),
      case when p.prokind = 'p' then 'procedure' else 'function' end,
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid),
      case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end,
      case when a.is_grantable then ' with grant option' else '' end
    )
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public'
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  select
    4,
    format(
      'alter default privileges for role %I%s grant %s on %s to %s%s;',
      owner_role.rolname,
      case
        when d.defaclnamespace = 0 then ''
        else ' in schema ' || quote_ident(n.nspname)
      end,
      lower(a.privilege_type),
      case d.defaclobjtype
        when 'r' then 'tables'
        when 'S' then 'sequences'
        when 'f' then 'functions'
        when 'T' then 'types'
        when 'n' then 'schemas'
      end,
      case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end,
      case when a.is_grantable then ' with grant option' else '' end
    )
  from pg_default_acl d
  join pg_roles owner_role on owner_role.oid = d.defaclrole
  left join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  left join pg_roles r on r.oid = a.grantee
  where (d.defaclnamespace = 0 or n.nspname = 'public')
    and d.defaclobjtype in ('r', 'S', 'f', 'T', 'n')
    and not (d.defaclobjtype = 'n' and d.defaclnamespace <> 0)
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))

  union all

  -- No global function row means the built-in default, which grants
  -- execute to PUBLIC. File 3's global revoke inserts a row that removes
  -- that grant. Emitting it here lets the snapshot put it back.
  select
    5,
    format(
      'alter default privileges for role %I grant %s on functions to %s%s;',
      owner_role.rolname,
      lower(a.privilege_type),
      case when a.grantee = 0 then 'public' else quote_ident(r.rolname) end,
      case when a.is_grantable then ' with grant option' else '' end
    )
  from pg_roles owner_role
  cross join lateral aclexplode(acldefault('f', owner_role.oid)) a
  left join pg_roles r on r.oid = a.grantee
  where owner_role.rolname in ('postgres', 'supabase_admin')
    and not exists (
      select 1
      from pg_default_acl d
      where d.defaclrole = owner_role.oid
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
    )
    and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
) emitted
order by sort_key, line;
