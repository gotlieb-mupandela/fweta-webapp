\ir 00_guard.sql

-- After supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql
-- applied twice. Additive objects are still present.

select rehearsal.ok(
  has_table_privilege('service_role', 'public.fweta_app_store', 'select')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'insert')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'update')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'delete')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'truncate')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'references')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'trigger'),
  'pass ' || :'pass' || ' revoke rollback restored insert, update, and delete only'
);

select revision as rev_before_restore from public.fweta_app_store where id = 'default' \gset

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at)
      values ('default', '{"profiles":[{"id":"upsert-after-rollback-c"}]}'::jsonb, now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' plain upsert executed after the revoke rollback'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = :rev_before_restore + 1
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"upsert-after-rollback-c"}]}'::jsonb,
  'pass ' || :'pass' || ' plain upsert works again and bumps revision'
);

select rehearsal.ok(
  to_regprocedure('public.fweta_cas_save_store(jsonb, bigint)') is not null,
  'pass ' || :'pass' || ' revoke rollback left fweta_cas_save_store in place'
);

select rehearsal.ok(
  has_function_privilege('service_role', 'public.fweta_json_store_set(jsonb)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.fweta_json_store_set(jsonb)'::regprocedure, 'execute')
  and not has_function_privilege('authenticated', 'public.fweta_json_store_set(jsonb)'::regprocedure, 'execute')
  and not exists (
    select 1
    from aclexplode((
      select proacl
      from pg_proc
      where oid = 'public.fweta_json_store_set(jsonb)'::regprocedure
    )) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'pass ' || :'pass' || ' revoke rollback restored fweta_json_store_set execute for service_role only'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$select public.fweta_json_store_set('{"profiles":[{"id":"json-store-set-restored"}]}'::jsonb)$stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' service_role can call fweta_json_store_set after the revoke rollback'
);

select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"json-store-set-restored"}]}'::jsonb,
  'pass ' || :'pass' || ' restored fweta_json_store_set wrote again'
);

select rehearsal.exec_as(
  'anon',
  '{"role":"anon"}',
  $stmt$select public.fweta_json_store_set('{"profiles":[{"id":"json-store-set-anon"}]}'::jsonb)$stmt$
) as json_set_anon \gset

\echo fweta_json_store_set as anon after rollback: :'json_set_anon'

select rehearsal.ok(
  :'json_set_anon' like '42501 permission denied for function%',
  'pass ' || :'pass' || ' anon still cannot call fweta_json_store_set after the revoke rollback'
);

select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"json-store-set-restored"}]}'::jsonb,
  'pass ' || :'pass' || ' anon call did not write'
);

-- Drop the rehearsal stand-in so the next pass applies the revoke file
-- while the function is absent again.
drop function public.fweta_json_store_set(jsonb);
