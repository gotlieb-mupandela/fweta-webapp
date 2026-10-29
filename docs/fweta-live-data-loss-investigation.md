# Live data loss investigation

Date: 2026-10-28.

Scope: live QA items 21, 22, 24, 26, and 30 (saves that appear to hang, pages that alternate between saved and empty data, name and bio reverting, rate cards vanishing, random 404s on campaign detail / Review / UGC brief, logins flapping, sessions ending right after login, slow pages). The local tree the QA report used was main `0906ed7`. The commit deployed on app.fweta.com was unknown then and was not fetched here.

This work did not deploy, did not change Vercel, and did not read or write the live Supabase project. No migration was added. Do not apply `supabase/migrations/20260830153000_fweta_app_store_grants.sql`. Do not run `supabase db push`.

## What was traced

- Read path: `readStore` → `ensureStore` in `lib/db/store.ts`.
- Write path: `updateStore` → `commitStoreToSupabase` → `fweta_cas_save_store`.
- Caches: process memory (`globalThis`), `revalidatePath`, and Next.js `fetch`. There is no `unstable_cache` and no `"use cache"` around the store.
- Session: JWT cookie, `sessionGate`, profile lookup through `readStore`.
- 404s: `getCampaign` and the brand campaign, Review, and UGC brief pages.

## Ranked causes

### 1. Proven. Each warm serverless instance kept the JSON document it loaded first

Before this change, the Supabase driver stored the whole document on `globalThis.__fwetaStore` and `ensureStore` returned that object for the life of the process. Writes already reloaded the row and compare-and-swapped, so one instance could not upsert its old copy over a newer signup. Reads did not reload.

Vercel Hobby runs more than one instance. Each instance has its own memory. A save updates Postgres and the instance that handled the save. Every other warm instance keeps serving the document from when it started, until that process exits or handles a write of its own. `revalidatePath` does not clear this object.

That is enough to explain the alternating reads. A request that hits the writer, or a cold instance, shows the save. A request that hits an older warm instance shows the previous arrays: no campaign, empty bio, no rate cards, old password hash. Reload "fixes" it when the next request lands on a copy that has the row. A few warm instances produce the "about 1 in 3" pattern.

Reproduction, same result on an in-memory document and on local Postgres 16 (`fweta_repro` only, function `fweta_cas_save_store`):

`npx tsx scripts/repro-two-store-instances.ts`

| Check | Pinned cache (old read) | Revision check (this fix) |
| --- | --- | --- |
| Campaign `c1` after the other instance saved it | 404 | 200 |
| Login with the new password hash | Invalid email or password. | ok |
| `sessionGate` with JWT credentialVersion 1 | expired | ok |
| Rate cards before the profile is in this copy | Create your public profile before adding rate cards. | ok |
| Blind save of the old full document at revision 1 | conflict, campaign remains | same |
| Form bio taken from that read, then saved | writes `""` over `"kept"` | keeps `"kept"` |

Test: `tests/db/store-read-coherence.test.ts`, "two instances: pinned cache is stale, revision check is not". `readPinned` is the old behavior. If `readCoherent` returns that warm copy, `coherentCampaign` stays `"404"` and the test fails.

How this becomes each live symptom:

**Item 21, pages alternate, name and bio revert.** Dashboard pages render `readStore()`. The profile form's `defaultValue` comes from `getProfileById` (`app/dashboard/settings/profile/page.tsx` lines 11-19, `lib/auth/session.ts` lines 91-93). The sidebar name is the JWT, not the store (`app/dashboard/layout.tsx` line 56). A successful save calls `refreshSessionFromProfile`, so the cookie can show the new name while a stale instance still renders the old bio. That matches "sidebar shows the edited name" and "bio empty on settings, filled on the public page" when those two requests hit different instances.

A later save makes it permanent. `updateProfileAction` (`app/actions/settings.ts` lines 31-32) writes the form bio onto the profile inside `updateStore`. The write loads a fresh row, then applies the form. Compare-and-swap accepts it, because the revision is the fresh one. The form values are whatever the stale page displayed. The repro saves `bio: ""` from the pinned form onto a row whose bio was `"kept"`, and the stored bio becomes `""`.

**Item 22, random 404 after save.** `getCampaign` (`app/actions/campaigns.ts` lines 35-37) uses `readStore()`. These pages call `notFound()` when the id is missing from that copy:

- Campaign detail: `app/dashboard/brand/campaigns/[id]/page.tsx` line 36
- Review: `app/dashboard/brand/campaigns/[id]/submissions/page.tsx` line 26
- UGC brief: `app/dashboard/brand/ugc/[id]/page.tsx` line 23
- Edit: `app/dashboard/brand/campaigns/[id]/edit/page.tsx` line 23
- Creator brief: `app/dashboard/ugc/[briefId]/page.tsx` line 19

The repro's pinned instance 404s campaign `c1` after the other instance saved it. The revision-checked read returns 200.

The logged-out public 404 that still showed the campaign title (fix-list item 35, findings part 1 item 1) is a different branch. Before commit `0906ed7` the public page 404'd when `campaignIsDiscoverable` was false, which includes an active campaign past its end date. `generateMetadata` in `app/campaigns/[id]/layout.tsx` still sets the document title when `status === "active"`. AISODX Hire ended 2026-10-21 and was still active, so that older page is a titled 404 and current main shows a closed page. The deployed SHA would say which of those live was running. It does not explain a 404 that appears and disappears on the brand detail page, because that page 404s only when `getCampaign` returns null.

**Item 24, login flap and `reason=expired`.** `login` (`lib/auth/session.ts` lines 210-216) finds the email in `readStore()` and checks the hash in that copy. Missing user and old hash both return "Invalid email or password." A different instance with the current row accepts the same details. The cookie is a 14-day JWT (lines 29-50). `getSession` checks the signature only.

`/login?reason=expired` is produced only when `app/dashboard/layout.tsx` lines 28-30 sees `sessionGate` return `"expired"`. That return is the credentialVersion mismatch in `lib/auth/session-gate.ts` line 7. The only writer of `credentialVersion` is `changePasswordAction` (`app/actions/settings.ts` lines 100-106). Login copies the version from the profile it just read (`lib/auth/session.ts` line 225). A JWT minted from a current profile (version 1) and a later request that still holds version 0 is an immediate expiry. The repro calls the real `sessionGate` and gets `"expired"` on the pinned copy and `"ok"` after the revision check.

A profile that is absent is `"missing"`, not `"expired"`. The layout does not end that session. Settings pages such as `app/dashboard/settings/profile/page.tsx` line 12 redirect to `/login` with no reason. So the exact URL `reason=expired` means the profile was found and its version disagreed with the cookie. That is proven for a password change plus a stale copy. It is not proven for a login that never changed the password.

The in-memory rate limit (`lib/security/rate-limit.ts`) says "Too many attempts", not "Invalid email or password." A missing `AUTH_SECRET` makes `getSession` return null, and the layout sends the user to `/login` with no reason. Neither is this URL.

**Item 26, photo disappears.** The public URL is stored on the same JSON profile (`app/actions/avatar.ts` lines 27-32). A copy from before the upload still has `avatarUrl` null, so the photo is gone after reload or a new login even though the row has it. `updateProfileAction` does not clear `avatarUrl`. "Save profile removes the photo" matches the refresh reading that older copy.

The sidebar never shows a photo for a separate, proven reason: it renders the name only (`components/dashboard/sidebar.tsx` line 84). `AppShell` is not given an image (`components/dashboard/app-shell.tsx` lines 29-35). That UI was not added here.

"Business has no upload control" is not this cache. The control is on `/dashboard/settings/profile` (`components/forms/profile-settings-form.tsx` line 27). `/dashboard/brand/profile` is not a route, which matches the 404 in the findings. No route was added.

**Item 30, rate cards vanish.** `app/dashboard/influencer/rate-cards/page.tsx` lines 35-38 shows "Create your public profile before adding rate cards." when `getMyInfluencerProfile` misses. `listMyRateCards` (`app/actions/influencer.ts` lines 228-232) then returns an empty list, so the cards disappear with the profile. `addRateCardAction` lines 184-188 refuses the add with "Create your public profile first." The repro's pinned instance returns the page sentence after the other instance created the profile.

The add button is already disabled while the request is pending (`components/forms/rate-card-form.tsx` lines 87-88). Two requests that both leave before that disable can insert two cards, because the mutator always pushes. This change does not dedupe that. Two action logs for the same user, a second apart, with two new ids, would confirm it.

### 2. Proven mechanism, unproven as the 3 to 25 second timings. The whole document is written on every real save

A save uploads the entire JSON row and retries up to 8 times on `fweta_store_conflict` (`lib/db/store-commit.ts` line 40). The button stays on "Saving…" until the action returns (`components/forms/profile-settings-form.tsx` lines 59-60). There is no client timeout.

Paths that decide to write from a read can start that upload when their copy looks incomplete. `ensureDiscoverableCreators` (`app/actions/influencer.ts` lines 53-58) and `seedDemoAccounts` (`lib/auth/session.ts` line 359) do this. Their mutators recheck the fresh row, so they should not drop fields, but they still sent the whole document. A mutator that changes nothing now skips the write (`lib/db/store-commit.ts` lines 70-76). Test: "a no-op mutator does not write, and a real change does".

With coherent reads, those paths see the current row and usually return before `updateStore`. That removes a class of extra uploads. It does not measure live duration. The octet length of `fweta_app_store.data`, and a function log with duration plus conflict count, are still required.

### 3. Likely, not proven. The password-change error page

`changePasswordAction` does not catch `StorePersistError`. After 8 conflicts, `commitLoadedMutation` throws, and `commitStoreToSupabase` wraps that as `StorePersistError`. An uncaught server action is the Next.js error page. Error id 4260176165 is not in this repo. The Vercel log line for that id would settle it.

### 4. Unproven as the live cause. Next.js fetch cache

Fetch has been uncached by default since Next.js 15 (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-15.md`). This app is Next.js 16.3.3. Nothing here uses `unstable_cache` for the store. A cached PostgREST GET could still freeze `revision` if a route set `fetchCache = 'default-cache'`. None do today. The service client now forces `cache: "no-store"` (`lib/db/supabase-fetch.ts`, used at `lib/db/supabase-store.ts` line 90). Test: "service role fetch sets cache no-store".

### 5. Ruled out. A stale full-document upsert

The blind save of the pinned document at revision 1 conflicts, and campaign `c1` is still there, both in memory and against local `fweta_cas_save_store`. The revision trigger treats a direct SQL edit as a new revision (`supabase/migrations/20261021165036_fweta_app_store_revision.sql`). Relational sync is off on live. The Supabase read path ignores the SQL mirror unless `FWETA_RELATIONAL_SYNC=true` (`lib/db/store.ts` lines 162-176).

## Fix

Supabase reads call `readCoherent` (`lib/db/store.ts` lines 178-182). The in-memory copy is reused only when `select revision` matches the copy. A mismatch loads `data` and `revision` together (`loadVersionedJsonStore`, `lib/db/supabase-store.ts` lines 191-194). A commit on this instance stores that revision (`lib/db/store.ts` lines 235-240) and will not move it backwards. A slow load cannot replace a newer commit from this process. If the document read fails, that request may still see the last copy, and the cached revision is not advanced, so the next read tries again. Test: "a failed reload does not mark the old copy as the new revision".

The file driver still keeps one process copy. One process owns `data/store.json`.

No migration file was added. The script's local database `fweta_repro` grants execute on `fweta_cas_save_store` to public so the script can call it. That statement lives only in `scripts/repro-two-store-instances.ts`. It is not a migration and must not be applied to the live project.

## Still unproven, and the evidence that would settle it

1. The deployed git SHA for app.fweta.com. Older than `0906ed7` means the logged-out public 404 for an ended-but-active campaign is the old `campaignIsDiscoverable` check. `0906ed7` or later means that particular 404 needs a new trace.

2. One save that hung or reverted, from the Vercel function log: action name, duration, revision read, revision written, any `fweta_store_conflict`, and the byte size of the JSON payload. No row contents. That separates a large upload, an 8-attempt conflict loop, and a timeout after a successful write.

3. One `/login?reason=expired` that was not right after a password change: the JWT `cv` and the `credentialVersion` on the profile that request read. If they match, `sessionGate` did not send the user there. If the profile was missing, the current layout would not add `reason=expired`.

4. Error id 4260176165: the error name and message from that function log.

5. `pg_column_size(data)` or `octet_length(data::text)` for `public.fweta_app_store` where `id = 'default'`. The number only. Together with item 2, this says whether 3 to 25 seconds is the payload.

6. Duplicate rate cards: two action invocations, same user, two new ids, timestamps about a second apart.

## Tests

`npm test` (56 tests, including `tests/db/store-read-coherence.test.ts`).

`npx tsc --noEmit` passed.

`npx tsx scripts/repro-two-store-instances.ts` passed against the in-memory document and against local Postgres 16.
