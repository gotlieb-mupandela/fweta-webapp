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

7. Never apply the PR 28 migration after the client-grant revoke File 1 of PR 41. PR 28 is `supabase/migrations/20261021100752_security_lockdown.sql`. File 1 of PR 41 is `supabase/migrations/20261026120000_revoke_client_table_grants.sql`. The PR 28 migration grants `authenticated` access back on `fweta_` tables. The same file grants all privileges on `public.fweta_app_store` to `service_role`, so applying it after step 4 hands direct table writes back.

## Writers of `public.fweta_app_store`

Searched `lib`, `app`, `scripts`, `supabase/migrations`, and SQL functions for `fweta_app_store`, `upsert`, `.from('fweta_app_store')`, `fweta_save_store`, `fweta_json_store_set`, and any function that updates the table. No app path writes the table without the revision check, so application code is unchanged.

| Path | What it writes | Checks revision |
| --- | --- | --- |
| `lib/db/supabase-store.ts` `compareAndSwap`, used by `commitStoreToSupabase` | Calls `fweta_cas_save_store`. That function inserts or updates the `default` row. | yes |
| `lib/db/supabase-store.ts` `diagnoseSupabaseStore` when `probe` is set | Calls `fweta_cas_save_store` with `expected_revision` `-1`. The function rejects that value and does not write. | yes |
| `supabase/migrations/20261026130000_store_revision_additive.sql` `fweta_cas_save_store` | Inserts or updates `public.fweta_app_store` where `id = 'default'`. | yes |
| `supabase/migrations/20261026130000_store_revision_additive.sql` `fweta_app_store_bump_revision` | Trigger. Sets `NEW.revision` on insert and when `data` changes. It does not compare an expected revision. | no |
| `public.fweta_json_store_set(jsonb)` | Not defined in this repo. The live function, and the rehearsal stand-in, update `data` with no revision argument. | no |
| `scripts/rehearsal/sql/*.sql` | Test inserts, updates, and deletes. Not an app path. | no |

`lib/db/supabase-store.ts` `loadJsonBlob` and the health check select `data` and `revision` only. There is no `.upsert(` and no `.from("fweta_app_store")` write in `app`, `lib`, or `scripts`.

`fweta_save_store(jsonb)` in `lib/db/supabase-store.ts` `saveRelationalStore`, `scripts/relational-roundtrip.sql`, and the copies in `supabase/migrations` replaces relational `fweta_*` rows. Those function bodies do not insert, update, or delete `public.fweta_app_store`.

After `supabase/migrations/20261026140000_store_revision_revoke_writes.sql` removes direct table writes from `service_role`:

- `compareAndSwap`, `commitStoreToSupabase`, and the health probe keep working. `fweta_cas_save_store` is security definer and writes as its owner. `select` on the table stays granted.
- `fweta_save_store` keeps working. This file does not change its grants, and it does not write `public.fweta_app_store`.
- A `service_role` insert, update, delete, or upsert of `public.fweta_app_store` fails. This repo has no such call. An older build that upserts `id`, `data`, and `updated_at` fails every save. That is why the revoke waits until the new build is deployed.
- A `service_role` call to `public.fweta_json_store_set(jsonb)` fails with permission denied and does not write. This repo does not call it. A caller outside this repo that still uses the service role on that function breaks.
- The bump trigger still runs for writes made by `fweta_cas_save_store`. Execute on the bump function is already revoked from `service_role`. PostgreSQL still runs an existing trigger without that grant.

## Rollback

Roll back the revoke (`supabase/rollbacks/20261026140000_store_revision_revoke_writes_rollback.sql`), then roll back the additive step (`supabase/rollbacks/20261026130000_store_revision_additive_rollback.sql`), then redeploy the old build.

## Before deploy

Set `PAYOUT_ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET`, and `NEXT_PUBLIC_APP_URL`. Use Vercel Node 22 or newer.

Rehearsals for these files ran on local Postgres 16, not on hosted Supabase.
