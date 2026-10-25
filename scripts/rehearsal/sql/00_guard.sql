-- Refuse anything that is not a local PostgreSQL 16 rehearsal database.
-- Included by every other rehearsal file. Safe to run more than once per session.

do $fweta_rehearsal_guard$
declare
  addr text := inet_server_addr()::text;
  ver int := current_setting('server_version_num')::int;
begin
  if current_database() !~ '^fweta_rehearsal_' then
    raise exception 'refusing rehearsal SQL on database %', current_database();
  end if;

  if ver < 160000 or ver >= 170000 then
    raise exception 'refusing PostgreSQL % (rehearsal requires 16)', current_setting('server_version');
  end if;

  if addr is not null and addr <> '127.0.0.1' and addr <> '::1' then
    raise exception 'refusing non-local server address %', addr;
  end if;

  if current_setting('fweta.rehearsal_guard', true) is distinct from 'ok' then
    perform set_config('fweta.rehearsal_guard', 'ok', false);
    raise notice 'guard ok database=% version=% addr=%',
      current_database(),
      current_setting('server_version'),
      coalesce(addr, 'unix-socket');
  end if;
end
$fweta_rehearsal_guard$;
