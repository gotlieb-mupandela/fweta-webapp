-- Proves fweta-media and fweta-kyc exist, are private, and that
-- anon and authenticated cannot read or write storage.objects.
-- Paste in the Supabase SQL editor after the private bucket migration.
-- A failure raises an exception. A success returns the two bucket rows.

do $$
declare
  media_public boolean;
  kyc_public boolean;
  policy_count integer;
begin
  select public into media_public from storage.buckets where id = 'fweta-media';
  if media_public is null then
    raise exception 'fweta-media is missing';
  end if;
  if media_public is true then
    raise exception 'fweta-media is public';
  end if;

  select public into kyc_public from storage.buckets where id = 'fweta-kyc';
  if kyc_public is null then
    raise exception 'fweta-kyc is missing';
  end if;
  if kyc_public is true then
    raise exception 'fweta-kyc is public';
  end if;

  select count(*) into policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      'anon' = any (roles)
      or 'authenticated' = any (roles)
      or 'public' = any (roles)
    );

  if policy_count > 0 then
    raise exception 'anon or authenticated can access storage.objects through % policies', policy_count;
  end if;
end $$;

select id, public, file_size_limit
from storage.buckets
where id in ('fweta-media', 'fweta-kyc')
order by id;
