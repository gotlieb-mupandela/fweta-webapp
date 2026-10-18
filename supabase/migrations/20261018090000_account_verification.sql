-- Extra fields for the admin bio-code queue. The JSON document remains the
-- source of truth. These columns are ready if a later relational copy is enabled.

alter table public.fweta_social_accounts
  add column if not exists review_requested_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists bio_hint text;
