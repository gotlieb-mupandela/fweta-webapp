\ir 00_guard.sql

-- After 20261026140000_store_revision_revoke_writes.sql, applied twice.

select rehearsal.ok(
  has_table_privilege('service_role', 'public.fweta_app_store', 'select')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'insert')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'update')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'delete')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'truncate')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'references')
  and not has_table_privilege('service_role', 'public.fweta_app_store', 'trigger'),
  'pass ' || :'pass' || ' revoke keeps select and removes insert, update, delete, truncate, references, trigger'
);

select revision as rev_before_denied from public.fweta_app_store where id = 'default' \gset

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$
    insert into public.fweta_app_store (id, data, updated_at)
    values ('default', '{"profiles":[{"id":"upsert-after-revoke"}]}'::jsonb, now())
    on conflict (id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at
  $stmt$
) as upsert_denied \gset

\echo old upsert after revoke: :'upsert_denied'

select rehearsal.ok(
  :'upsert_denied' like '42501 permission denied%',
  'pass ' || :'pass' || ' old upsert is permission denied after revoke'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$delete from public.fweta_app_store where id = 'default'$stmt$
) as delete_denied \gset

\echo delete after revoke: :'delete_denied'

select rehearsal.ok(
  :'delete_denied' like '42501 permission denied%',
  'pass ' || :'pass' || ' service_role delete is permission denied after revoke'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = :rev_before_denied
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"cas-1"}]}'::jsonb,
  'pass ' || :'pass' || ' denied upsert and delete did not change the row'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$
    insert into rehearsal.scratch (id, result)
    values (
      'cas-after-revoke',
      public.fweta_cas_save_store(
        '{"profiles":[{"id":"cas-after-revoke"}]}'::jsonb,
        (select revision from public.fweta_app_store where id = 'default')
      )::text
    )
    on conflict (id) do update set result = excluded.result
  $stmt$
) as cas_after_revoke \gset

\echo cas after revoke: :'cas_after_revoke'

select rehearsal.ok(
  :'cas_after_revoke' = 'ok'
  and (select result from rehearsal.scratch where id = 'cas-after-revoke')::bigint = :rev_before_denied + 1
  and (select revision from public.fweta_app_store where id = 'default') = :rev_before_denied + 1
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"cas-after-revoke"}]}'::jsonb,
  'pass ' || :'pass' || ' cas save still works after table writes are revoked'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$
    insert into rehearsal.scratch (id, result)
    values (
      'read-after-revoke',
      (select data::text from public.fweta_app_store where id = 'default')
    )
    on conflict (id) do update set result = excluded.result
  $stmt$
) as read_after_revoke \gset

\echo select after revoke: :'read_after_revoke'

select rehearsal.ok(
  :'read_after_revoke' = 'ok'
  and (select result::jsonb from rehearsal.scratch where id = 'read-after-revoke')
    = '{"profiles":[{"id":"cas-after-revoke"}]}'::jsonb,
  'pass ' || :'pass' || ' service_role can still select the document'
);

-- The repo does not ship fweta_json_store_set. The two applies above already
-- succeeded while it was absent. This stand-in writes without comparing
-- revision, which is the live behavior the execute revoke is meant to stop.
select rehearsal.ok(
  to_regprocedure('public.fweta_json_store_set(jsonb)') is null,
  'pass ' || :'pass' || ' fweta_json_store_set was absent when the revoke file ran'
);

create function public.fweta_json_store_set(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fweta_app_store
  set data = payload
  where id = 'default';
end
$$;

revoke all on function public.fweta_json_store_set(jsonb) from public;
grant execute on function public.fweta_json_store_set(jsonb) to service_role, public, anon, authenticated;

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$select public.fweta_json_store_set('{"profiles":[{"id":"json-store-set"}]}'::jsonb)$stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' fweta_json_store_set executed without a revision argument'
);

select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"json-store-set"}]}'::jsonb,
  'pass ' || :'pass' || ' fweta_json_store_set overwrote the document'
);

\ir ../../../supabase/migrations/20261026140000_store_revision_revoke_writes.sql

select rehearsal.ok(
  not has_function_privilege('service_role', 'public.fweta_json_store_set(jsonb)'::regprocedure, 'execute')
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
  'pass ' || :'pass' || ' execute on fweta_json_store_set is revoked from service_role, public, anon, and authenticated'
);

select revision as rev_before_json_set_denial from public.fweta_app_store where id = 'default' \gset

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$select public.fweta_json_store_set('{"profiles":[{"id":"json-store-set-denied"}]}'::jsonb)$stmt$
) as json_set_denied \gset

\echo fweta_json_store_set after revoke: :'json_set_denied'

select rehearsal.ok(
  :'json_set_denied' like '42501 permission denied for function%',
  'pass ' || :'pass' || ' service_role cannot call fweta_json_store_set after revoke'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = :rev_before_json_set_denial
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"json-store-set"}]}'::jsonb,
  'pass ' || :'pass' || ' denied fweta_json_store_set did not write'
);
