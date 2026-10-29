-- DO NOT APPLY until Gotlieb approves.
-- Do not run this file. Do not run supabase db push.
-- Do not apply migration 20260830153000.
--
-- Private Storage bucket for ID photos. Nothing here changes app data.
-- The Next.js server uploads and downloads with the service role, which
-- bypasses Storage RLS. There is no policy for anon or authenticated, so
-- those roles cannot read or write ID photos.
-- A signed-in owner or an admin can view a photo only through /api/kyc/[name].

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyc-documents',
  'kyc-documents',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Hosted Supabase already enables RLS on storage.objects (owned by
-- supabase_storage_admin), so it is not repeated here; doing so fails with 42501.
