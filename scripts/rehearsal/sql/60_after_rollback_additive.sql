\ir 00_guard.sql

-- After supabase/rollbacks/20261026130000_store_revision_additive_rollback.sql
-- applied twice.

select rehearsal.ok(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'fweta_app_store'
  ) = array['id', 'data', 'updated_at']::text[],
  'pass ' || :'pass' || ' additive rollback removed the revision column'
);

select rehearsal.ok(
  to_regprocedure('public.fweta_cas_save_store(jsonb, bigint)') is null
  and to_regprocedure('public.fweta_app_store_bump_revision()') is null,
  'pass ' || :'pass' || ' additive rollback dropped both functions'
);

select rehearsal.ok(
  not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'fweta_app_store'
      and t.tgname = 'fweta_app_store_bump_revision'
      and not t.tgisinternal
  ),
  'pass ' || :'pass' || ' additive rollback dropped the bump trigger'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at)
      values ('default', '{"profiles":[{"id":"after-rollback-a"}]}'::jsonb, now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' plain upsert executed after both rollbacks'
);

select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"after-rollback-a"}]}'::jsonb,
  'pass ' || :'pass' || ' plain upsert works after both rollbacks'
);

select rehearsal.ok(
  has_table_privilege('service_role', 'public.fweta_app_store', 'insert')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'update'),
  'pass ' || :'pass' || ' service_role table writes remain after the additive rollback'
);
