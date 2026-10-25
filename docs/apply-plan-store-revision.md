# Apply the store revision change

Live must never execute `20261021165036_fweta_app_store_revision.sql`. This pull request deletes that file. It revoked table writes in the same step that added `revision`, so the current build would fail every save. Do not paste an old copy.

If live's migration history has no row for `20261021165036`, no repair is needed. If that version is already recorded as applied, leave the record and do not run the SQL.

## Order

1. Mark `20261021165036` applied without running it only if a runner would otherwise run it: `supabase migration repair --status applied 20261021165036`. This pull request deletes the file, so a runner that only sees the files in the repo will not try to run it. Skip the repair unless that version is still pending.

2. Apply `supabase/migrations/20261026130000_store_revision_additive.sql`. The current build can keep upserting. The trigger bumps `revision`.

3. In the same short window, deploy main (or the 33, 34, 36 stack). Smoke a signup and confirm one compare-and-swap save.

4. Only after that smoke passes, apply `supabase/migrations/20261026140000_store_revision_revoke_writes.sql`. The same file revokes execute on `public.fweta_json_store_set(jsonb)` from `service_role`, `public`, `anon`, and `authenticated` if that function exists. It skips the revision check. This revoke is safe only if the live build in use does not call it. The repo code does not.

5. Never re-run `supabase/migrations/20260830153000_fweta_app_store_grants.sql`. It hands writes back to `service_role`.

6. Later, you may drop `fweta_json_store_set` if it is still present. Step 4 already revokes execute when the function exists.

## Rollback

Roll back the revoke (`supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql`), then roll back the additive step (`supabase/rollbacks/20261026130000_store_revision_additive_rollback.sql`), then redeploy the old build.

## Before deploy

Set `PAYOUT_ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET`, and `NEXT_PUBLIC_APP_URL`. Use Vercel Node 22 or newer.

Rehearsals for these files ran on local Postgres 16, not on hosted Supabase.
