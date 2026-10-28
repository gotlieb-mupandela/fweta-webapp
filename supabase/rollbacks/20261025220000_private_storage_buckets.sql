-- Undo supabase/migrations/20261025220000_private_storage_buckets.sql
-- Apply only if Gotlieb asks to remove the private buckets.
-- This deletes every object in fweta-media and fweta-kyc, then drops those buckets.
-- It does not recreate public avatar policies. If a legacy avatars bucket was locked, it stays private.

delete from storage.objects where bucket_id in ('fweta-media', 'fweta-kyc');
delete from storage.buckets where id in ('fweta-media', 'fweta-kyc');
