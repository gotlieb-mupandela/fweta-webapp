-- Ensure service role can read/write the JSON store (some projects need explicit grants).
-- Safe to re-run.

grant usage on schema public to service_role;
grant all on public.fweta_app_store to service_role;

-- If relational tables exist from 20260829150000 migration:
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'fweta_profiles') then
    grant all on all tables in schema public to service_role;
    grant execute on all functions in schema public to service_role;
  end if;
end $$;
