# Apply the store revision change

Live must never execute `20261021165036_fweta_app_store_revision.sql`. This pull request deletes that file. It revoked table writes in the same step that added `revision`, so the current build would fail every save. Do not paste an old copy.

If live's migration history has no row for `20261021165036`, no repair is needed. If that version is already recorded as applied, leave the record and do not run the SQL.

Never re-run the PR 28 grants (`supabase/migrations/20261021100752_security_lockdown.sql`) or File 1 of PR 41 (`supabase/migrations/20261026120000_revoke_client_table_grants.sql`) after the revoke file. They grant `service_role` or client roles privileges back.

## Order

1. Mark `20261021165036` applied without running it only if a runner would otherwise run it: `supabase migration repair --status applied 20261021165036`. This pull request deletes the file, so a runner that only sees the files in the repo will not try to run it. Skip the repair unless that version is still pending.

2. Apply `supabase/migrations/20261026130000_store_revision_additive.sql`. Live does not have this yet: `fweta_cas_save_store` does not exist, and the table has no revision column. The live build saves by a direct upsert on `public.fweta_app_store` with the service role, and `service_role` keeps table write access. After this file that upsert still works. The trigger bumps `revision`.

Until a build that saves through `fweta_cas_save_store` is live, the revision check is not enforced on any write path, whichever function is used.

3. Deploy a build that saves through `fweta_cas_save_store`. Verify one compare-and-swap save. After a fresh deploy, run `POST /api/jobs/housekeeping` with the header `Authorization: Bearer $CRON_SECRET` once. This creates the first env admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and only when no profile already uses `ADMIN_EMAIL`. It never changes an existing account and never deletes duplicate profiles. Opening `/login` does not create the admin. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before this step.

4. Only after that save is verified, apply `supabase/migrations/20261026140000_store_revision_revoke_writes.sql`. Repeat the two read-only checks under "Before the revoke" first. The file removes direct table writes from `service_role`, so an earlier apply fails the live upsert. It also revokes execute on `public.fweta_json_store_set(jsonb)` from `service_role`, `public`, `anon`, and `authenticated` if that function exists. That function revoke is a hardening step against bypassing the revision check. The live build does not need `fweta_json_store_set`. The only risk of running that function revoke early is if the live build turns out to call `fweta_json_store_set`. The deployed-commit grep answers that. The revoke covers only `fweta_json_store_set(jsonb)`. Anything else the catalog query finds must be reviewed first.

5. Never re-run `supabase/migrations/20260830153000_fweta_app_store_grants.sql`. It hands writes back to `service_role`.

6. Later, you may drop `fweta_json_store_set` if it is still present. Step 4 already revokes execute when the function exists.

7. Never re-run the PR 28 grants (`supabase/migrations/20261021100752_security_lockdown.sql`) or File 1 of PR 41 (`supabase/migrations/20261026120000_revoke_client_table_grants.sql`) after the revoke file. They grant `service_role` or client roles privileges back.

## Before the revoke

Repeat both checks before step 4. They are read-only. Do not query `pg_stat_user_functions`. `track_functions` is off on live, so call counts prove nothing. Turning `track_functions` on is a settings change and needs the owner's OK. It is not part of this plan.

1. List every function whose source mentions `fweta_app_store`:

```sql
select n.nspname as schema_name,
       p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosrc ilike '%fweta_app_store%'
order by 1, 2;
```

David's read-only result on live: only two functions mention `fweta_app_store`. Both are in `public`, both are security definer, and both are executable only by `service_role`. `fweta_json_store_get` reads. `fweta_json_store_set` writes and does not check revision. `fweta_cas_save_store` does not exist on live, so the additive step is not applied. This list is functions only. The live build's save is the direct table upsert, not one of these functions.

The revoke covers only `fweta_json_store_set(jsonb)`. If this query returns anything else, review it before applying the revoke.

2. Grep the deployed commit for `fweta_json_store_set`:

```bash
git grep -n fweta_json_store_set <deployed-commit>
```

A hit means that build calls the function. Leave execute in place until a deployed commit has no hit and a save through `fweta_cas_save_store` has been verified.

## Writers of `public.fweta_app_store`

Searched `lib`, `app`, `scripts`, `supabase/migrations`, and SQL functions for `fweta_app_store`, `upsert`, `.from('fweta_app_store')`, `fweta_save_store`, `fweta_json_store_set`, and any function that updates the table. No app path in this repo writes the table without the revision check, so application code is unchanged. This table is the repo. Live today is the direct upsert in "Before the revoke". `fweta_cas_save_store` is not installed there yet.

| Path | What it writes | Checks revision |
| --- | --- | --- |
| `lib/db/supabase-store.ts` `compareAndSwap`, used by `commitStoreToSupabase` | Calls `fweta_cas_save_store`. That function inserts or updates the `default` row. | yes |
| `lib/db/supabase-store.ts` `diagnoseSupabaseStore` when `probe` is set | Calls `fweta_cas_save_store` with `expected_revision` `-1`. The function rejects that value and does not write. | yes |
| `supabase/migrations/20261026130000_store_revision_additive.sql` `fweta_cas_save_store` | Inserts or updates `public.fweta_app_store` where `id = 'default'`. | yes |
| `supabase/migrations/20261026130000_store_revision_additive.sql` `fweta_app_store_bump_revision` | Trigger. Sets `NEW.revision` on insert and when `data` changes. It does not compare an expected revision. | no |
| `public.fweta_json_store_set(jsonb)` | Not defined in this repo. On live it writes `data` with no revision argument. The live app save is the direct upsert, not this function. | no |
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

Set `PAYOUT_ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `NEXT_PUBLIC_APP_URL`. Use Vercel Node 22 or newer.

After a fresh deploy, run `POST /api/jobs/housekeeping` with the header `Authorization: Bearer $CRON_SECRET` once. This creates the first env admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and only when no profile already uses `ADMIN_EMAIL`. It never changes an existing account and never deletes duplicate profiles. Opening `/login` does not create the admin. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before this step.

Rehearsals for these files ran on local Postgres 16, not on hosted Supabase.
