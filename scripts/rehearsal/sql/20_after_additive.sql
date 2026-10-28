\ir 00_guard.sql

-- After 20261026130000_store_revision_additive.sql, applied twice by the shell.
-- The row already exists. Its revision reads as 0 until data changes.

select rehearsal.ok(
  (
    select count(*)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'fweta_app_store'
      and t.tgname = 'fweta_app_store_bump_revision'
      and not t.tgisinternal
  ) = 1,
  'pass ' || :'pass' || ' exactly one bump trigger after applying additive twice'
);

select rehearsal.ok(
  (
    select data_type = 'bigint' and is_nullable = 'NO' and column_default is not null
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fweta_app_store'
      and column_name = 'revision'
  ),
  'pass ' || :'pass' || ' revision is bigint not null with a default'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 0,
  'pass ' || :'pass' || ' existing row reads revision 0 before the next data change'
);

select rehearsal.ok(
  has_table_privilege('service_role', 'public.fweta_app_store', 'insert')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'update')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'delete')
  and has_table_privilege('service_role', 'public.fweta_app_store', 'select'),
  'pass ' || :'pass' || ' additive step did not revoke service_role insert, update, delete, or select'
);

select rehearsal.ok(
  not has_function_privilege('service_role', 'public.fweta_app_store_bump_revision()'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.fweta_app_store_bump_revision()'::regprocedure, 'execute')
  and not has_function_privilege('authenticated', 'public.fweta_app_store_bump_revision()'::regprocedure, 'execute'),
  'pass ' || :'pass' || ' bump function execute is revoked from the API roles'
);

select rehearsal.ok(
  has_function_privilege('service_role', 'public.fweta_cas_save_store(jsonb,bigint)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.fweta_cas_save_store(jsonb,bigint)'::regprocedure, 'execute')
  and not has_function_privilege('authenticated', 'public.fweta_cas_save_store(jsonb,bigint)'::regprocedure, 'execute')
  and not exists (
    select 1
    from aclexplode((
      select proacl
      from pg_proc
      where oid = 'public.fweta_cas_save_store(jsonb,bigint)'::regprocedure
    )) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'pass ' || :'pass' || ' fweta_cas_save_store execute is service_role only'
);

select rehearsal.ok(
  (select prosecdef from pg_proc where oid = 'public.fweta_cas_save_store(jsonb,bigint)'::regprocedure)
  and (select proconfig from pg_proc where oid = 'public.fweta_cas_save_store(jsonb,bigint)'::regprocedure)
    = array['search_path=""']::text[],
  'pass ' || :'pass' || ' cas function is security definer with an empty search_path'
);

select rehearsal.ok(
  not (select prosecdef from pg_proc where oid = 'public.fweta_app_store_bump_revision()'::regprocedure)
  and (select proconfig from pg_proc where oid = 'public.fweta_app_store_bump_revision()'::regprocedure)
    = array['search_path=""']::text[],
  'pass ' || :'pass' || ' bump function is security invoker with an empty search_path'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role","sub":"11111111-1111-1111-1111-111111111111"}',
  $stmt$
    insert into rehearsal.scratch (id, result)
    values ('auth', coalesce(auth.role(), 'null') || ' ' || coalesce(auth.uid()::text, 'null'))
    on conflict (id) do update set result = excluded.result
  $stmt$
) as auth_probe \gset

\echo auth stub call: :'auth_probe'

select result as auth_claims from rehearsal.scratch where id = 'auth' \gset

\echo auth.role and auth.uid as service_role: :'auth_claims'

select rehearsal.ok(
  :'auth_probe' = 'ok',
  'pass ' || :'pass' || ' auth stub is callable as service_role'
);

select rehearsal.ok(
  (select result from rehearsal.scratch where id = 'auth')
    = 'service_role 11111111-1111-1111-1111-111111111111',
  'pass ' || :'pass' || ' auth.role and auth.uid read request.jwt.claims'
);

-- Same document the baseline left behind. updated_at changes. data does not.
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
  'pass ' || :'pass' || ' plain upsert of unchanged data still works'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 0,
  'pass ' || :'pass' || ' unchanged data does not bump revision'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at)
      values ('default', '{"profiles":[{"id":"upsert-1"}]}'::jsonb, now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' plain upsert of new data still works'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 1
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"upsert-1"}]}'::jsonb,
  'pass ' || :'pass' || ' plain upsert bumped revision from 0 to 1'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at)
      values ('default', '{"profiles":[{"id":"upsert-2"}]}'::jsonb, now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' second plain upsert executed'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 2
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"upsert-2"}]}'::jsonb,
  'pass ' || :'pass' || ' second plain upsert bumped revision to 2'
);

-- Once the column exists, the last pre-CAS build can include revision in the
-- upsert body. The trigger must ignore that value and move forward by one.
select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at, revision)
      values ('default', '{"profiles":[{"id":"client-rev"}]}'::jsonb, now(), 999)
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at,
          revision = excluded.revision
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' upsert that sends a client revision executed'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 3
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"client-rev"}]}'::jsonb,
  'pass ' || :'pass' || ' client revision 999 was ignored and the trigger stored 3'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$
      insert into public.fweta_app_store (id, data, updated_at)
      values ('old-insert', '{"profiles":[{"id":"inserted"}]}'::jsonb, now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
    $stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' plain insert of a second id executed'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'old-insert') = 1,
  'pass ' || :'pass' || ' plain insert sets revision 1, not the column default 0'
);

select rehearsal.ok(
  rehearsal.exec_as(
    'service_role',
    '{"role":"service_role"}',
    $stmt$delete from public.fweta_app_store where id = 'old-insert'$stmt$
  ) = 'ok',
  'pass ' || :'pass' || ' service_role delete executed before the revoke step'
);

select rehearsal.ok(
  not exists (select 1 from public.fweta_app_store where id = 'old-insert'),
  'pass ' || :'pass' || ' service_role can still delete before the revoke step'
);

update public.fweta_app_store
set data = '{"profiles":[{"id":"owner-edit"}]}'::jsonb
where id = 'default';

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 4,
  'pass ' || :'pass' || ' direct SQL edit bumps revision to 4'
);

update public.fweta_app_store
set data = '{"profiles":[{"id":"backwards"}]}'::jsonb,
    revision = 0
where id = 'default';

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 5,
  'pass ' || :'pass' || ' a writer setting revision back to 0 stored 5 instead'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role","sub":"11111111-1111-1111-1111-111111111111"}',
  $stmt$
    insert into rehearsal.scratch (id, result)
    values (
      'cas',
      public.fweta_cas_save_store(
        '{"profiles":[{"id":"cas-1"}]}'::jsonb,
        (select revision from public.fweta_app_store where id = 'default')
      )::text
    )
    on conflict (id) do update set result = excluded.result
  $stmt$
) as cas_exec \gset

\echo fweta_cas_save_store as service_role: :'cas_exec'

select rehearsal.ok(:'cas_exec' = 'ok', 'pass ' || :'pass' || ' cas save executed as service_role');

select rehearsal.ok(
  (select result from rehearsal.scratch where id = 'cas') = '6'
  and (select revision from public.fweta_app_store where id = 'default') = 6
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"cas-1"}]}'::jsonb,
  'pass ' || :'pass' || ' cas save returned 6 and stored that revision'
);

select rehearsal.exec_as(
  'service_role',
  '',
  $stmt$
    select public.fweta_cas_save_store(
      '{"profiles":[{"id":"no-jwt"}]}'::jsonb,
      (select revision from public.fweta_app_store where id = 'default')
    )
  $stmt$
) as no_jwt \gset

\echo service_role without jwt claims: :'no_jwt'

select rehearsal.ok(
  :'no_jwt' = '42501 fweta store RPCs are limited to the service role',
  'pass ' || :'pass' || ' service_role without jwt claims is denied'
);

select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"cas-1"}]}'::jsonb,
  'pass ' || :'pass' || ' missing jwt did not write'
);

select revision as rev_for_denial from public.fweta_app_store where id = 'default' \gset

select rehearsal.exec_as(
  'anon',
  '{"role":"anon"}',
  'select public.fweta_cas_save_store(''{"profiles":[{"id":"anon"}]}''::jsonb, ' || :'rev_for_denial' || ')'
) as anon_denial \gset

\echo anon cas denial: :'anon_denial'

select rehearsal.ok(
  :'anon_denial' like '42501 permission denied for function%',
  'pass ' || :'pass' || ' anon is denied execute on fweta_cas_save_store'
);

select rehearsal.exec_as(
  'authenticated',
  '{"role":"authenticated"}',
  'select public.fweta_cas_save_store(''{"profiles":[{"id":"authenticated"}]}''::jsonb, ' || :'rev_for_denial' || ')'
) as authenticated_denial \gset

\echo authenticated cas denial: :'authenticated_denial'

select rehearsal.ok(
  :'authenticated_denial' like '42501 permission denied for function%',
  'pass ' || :'pass' || ' authenticated is denied execute on fweta_cas_save_store'
);

select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"cas-1"}]}'::jsonb
  and (select revision from public.fweta_app_store where id = 'default') = 6,
  'pass ' || :'pass' || ' anon and authenticated denials did not write'
);

begin;
grant execute on function public.fweta_cas_save_store(jsonb, bigint) to anon;
select rehearsal.exec_as(
  'anon',
  '{"role":"anon","sub":"33333333-3333-3333-3333-333333333333"}',
  'select public.fweta_cas_save_store(''{"profiles":[{"id":"anon-gate"}]}''::jsonb, ' || :'rev_for_denial' || ')'
) as anon_gate \gset
\echo anon with execute still hits auth.role: :'anon_gate'
select rehearsal.ok(
  :'anon_gate' = '42501 fweta store RPCs are limited to the service role',
  'pass ' || :'pass' || ' anon execute grant still hits the service_role gate'
);
select rehearsal.ok(
  (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"cas-1"}]}'::jsonb,
  'pass ' || :'pass' || ' auth.role gate did not write'
);
rollback;

select rehearsal.ok(
  not has_function_privilege('anon', 'public.fweta_cas_save_store(jsonb,bigint)'::regprocedure, 'execute'),
  'pass ' || :'pass' || ' temporary anon execute grant was rolled back'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$
    select public.fweta_cas_save_store(
      '{"profiles":[{"id":"stale"}]}'::jsonb,
      (select revision from public.fweta_app_store where id = 'default') - 1
    )
  $stmt$
) as stale_conflict \gset

\echo stale revision: :'stale_conflict'

select rehearsal.ok(
  :'stale_conflict' = '40001 fweta_store_conflict',
  'pass ' || :'pass' || ' stale revision raises 40001'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$
    select public.fweta_cas_save_store(
      '{"profiles":[{"id":"null-expected"}]}'::jsonb,
      null
    )
  $stmt$
) as null_expected \gset

\echo null expected revision while the row exists: :'null_expected'

select rehearsal.ok(
  :'null_expected' = '40001 fweta_store_conflict',
  'pass ' || :'pass' || ' null expected revision raises 40001 when the row exists'
);

select rehearsal.exec_as(
  'service_role',
  '{"role":"service_role"}',
  $stmt$
    select public.fweta_cas_save_store(
      '{"profiles":[]}'::jsonb,
      (select revision from public.fweta_app_store where id = 'default')
    )
  $stmt$
) as empty_profiles \gset

\echo empty profile list: :'empty_profiles'

select rehearsal.ok(
  :'empty_profiles' = '23514 refusing to replace a populated store with an empty profile list',
  'pass ' || :'pass' || ' cas refuses to wipe a populated profile list'
);

select rehearsal.ok(
  (select revision from public.fweta_app_store where id = 'default') = 6
  and (select data from public.fweta_app_store where id = 'default')
    = '{"profiles":[{"id":"cas-1"}]}'::jsonb,
  'pass ' || :'pass' || ' conflicts left revision 6 and the cas document in place'
);

-- Privilege baseline for the revoke file. The shell applies the revoke next.
-- Pass 1 and pass 2 each take a fresh snapshot, then roll the revoke back.
delete from rehearsal.scratch
where id = 'tableacl:service_role'
   or id like 'fnacl:%';

insert into rehearsal.scratch (id, result)
values (
  'tableacl:service_role',
  rehearsal.service_role_table_privs('public.fweta_app_store'::regclass)
);

insert into rehearsal.scratch (id, result)
select 'fnacl:' || p.oid::text, coalesce(p.proacl::text, '<null>')
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'fweta\_%' escape '\';

select rehearsal.ok(
  (select result from rehearsal.scratch where id = 'tableacl:service_role')
    = 'DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'
  or (
    current_setting('server_version_num')::int >= 170000
    and (select result from rehearsal.scratch where id = 'tableacl:service_role')
      = 'DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'
  ),
  'pass ' || :'pass' || ' pre-revoke service_role table privileges are the grant-all baseline: '
    || (select result from rehearsal.scratch where id = 'tableacl:service_role')
);
