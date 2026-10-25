\ir 00_guard.sql
\set ON_ERROR_STOP on
\set VERBOSITY verbose
\pset pager off

begin;
set local statement_timeout = '20s';
set local lock_timeout = '15s';
select set_config(
  'request.jwt.claims',
  '{"role":"service_role","sub":"22222222-2222-2222-2222-222222222222"}',
  true
);
set local role service_role;
select 'SUCCESS ' || public.fweta_cas_save_store(
  jsonb_build_object(
    'profiles',
    jsonb_build_array(jsonb_build_object('id', :'worker_id'))
  ),
  :'expected_revision'::bigint
)::text as rehearsal_result;
commit;
