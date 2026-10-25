-- Roll back 20261026140000_store_revision_revoke_writes.sql.
-- Grants insert, update, and delete on public.fweta_app_store back to service_role
-- so an older build can upsert again.
--
-- Does not grant truncate, references, or trigger. The revoke step removed those
-- as well. The old upsert uses insert and update only.
-- Does not remove revision, the bump trigger, or fweta_cas_save_store.
-- Idempotent.

grant insert, update, delete on table public.fweta_app_store to service_role;
