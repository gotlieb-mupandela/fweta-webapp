\ir 00_guard.sql

-- Old-build baseline, before either new migration.
-- The upsert lists only id, data, and updated_at. That is the shape of the
-- pre-CAS supabase-js call:
--   from('fweta_app_store').upsert({ id, data, updated_at }, { onConflict: 'id' })

select rehearsal.ok(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'fweta_app_store'
  ) = array['id', 'data', 'updated_at']::text[],
  'pass ' || :'pass' || ' baseline columns are id, data, updated_at'
);

select rehearsal.ok(
  to_regprocedure('public.fweta_cas_save_store(jsonb, bigint)') is null,
  'pass ' || :'pass' || ' baseline has no fweta_cas_save_store'
);

select rehearsal.ok(
  to_regprocedure('public.fweta_app_store_bump_revision()') is null,
  'pass ' || :'pass' || ' baseline has no bump function'
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
  'pass ' || :'pass' || ' baseline has no bump trigger'
);

select rehearsal.ok(
  has_table_privilege('service_role', 'public.fweta_app_store', 'insert')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'update')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'delete')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'select'),
  'pass ' || :'pass' || ' service_role can read and write the table'
);

select rehearsal.ok(
  (select relrowsecurity and not relforcerowsecurity
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'fweta_app_store'),
  'pass ' || :'pass' || ' rls is enabled and not forced'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at)
      values ('default', '{"profiles":[{"id":"baseline-write"}]}'::jsonb, now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' plain upsert as service_role works'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at)
      values ('default', '{"profiles":[{"id":"baseline"}]}'::jsonb, now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' second plain upsert as service_role works'
);

select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"baseline"}]}'::jsonb,
  'pass ' || :'pass' || ' baseline document is stored'
);

select rehearsal.ok(
  (select count(*) from public.fweta_app_store) = 1,
  'pass ' || :'pass' || ' baseline has one store row'
);
