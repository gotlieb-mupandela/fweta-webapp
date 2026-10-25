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
