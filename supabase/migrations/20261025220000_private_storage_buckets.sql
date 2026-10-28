-- Private storage for fweta.
-- Apply in the Supabase SQL editor. Do not run this from the app or from a deploy.
-- This does not require 20260913140000_avatars_bucket.sql. Live has no buckets yet.
-- The app uses the service role only. anon and authenticated get no storage.objects policies.
-- Service role bypasses row level security. With no policies, anon and authenticated cannot read or write.

-- If an older public avatars bucket exists, lock it. This updates zero rows when it does not.
update storage.buckets
set public = false
where id = 'avatars';

drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;
drop policy if exists "avatars_owner_delete" on storage.objects;

-- General private bucket: avatars, view screenshots, and UGC. 40 MB is the largest advertised limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fweta-media',
  'fweta-media',
  false,
  41943040,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- KYC documents. 4 MB, private, separate from the general bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fweta-kyc',
  'fweta-kyc',
  false,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
