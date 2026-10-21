# fweta go-live checklist

Brand deposits stay a manual record. Creator payouts stay a manual EFT. There is no payment gateway to configure.

This file splits what the repo already does from what Gotlieb has to provide. Nothing here writes to a live database.

## Done in the repo

- **Store adapter.** `lib/db/adapter.ts` uses Postgres when `NEXT_PUBLIC_SUPABASE_URL` and a service-role key are set. Otherwise it uses `data/store.json`. `FWETA_STORE=file` forces the file. A failed Supabase read does not cache an empty store and write it back.
- **SQL, not applied.** `supabase/migrations/20261017160000_production_hardening.sql` adds the profile columns the app already saves (name, socials, onboarding, credential version), `fweta_campaigns.settled_at`, a `revision` column for safer JSON writes, non-negative wallet and positive ledger checks (`NOT VALID`), indexes, and revokes `anon` / `authenticated` from the store tables and from `fweta_load_store` / `fweta_save_store`. Those functions are `security invoker`. The save function refuses to replace a populated profile table with an empty list. The campaign load and save include `settledAt`.
- **Sessions.** Production rejects the published dev secrets. Demo `*@fweta.test` accounts are not seeded in production unless `FWETA_SEED_DEMO=true`. Password changes bump `credentialVersion` and older cookies are sent to `/api/auth/end-session`. Suspended accounts are rejected on the dashboard and on server actions.
- **Abuse limits.** Login, signup, and password change are rate limited per instance. Login `next` must be a relative path. Cron and the health write-probe compare the bearer token in constant time.
- **Manual view counts.** An admin enters totals at `/dashboard/admin/views`. Saving a higher count writes a snapshot and runs the existing CPM earnings math. Counts cannot be lowered. Nothing simulates views. `GET` or `POST /api/jobs/poll-views` returns 401 without the cron bearer, 410 when Apify is unset, and runs a fetch only when `APIFY_API_TOKEN` is set.
- **Errors.** `ERROR_WEBHOOK_URL`, if set, receives a short JSON report from `/api/observability` and from server `reportServerError`. Unset, the app only logs.
- **Pages.** Terms, privacy, and creator terms live under `/legal`. `app/not-found.tsx` is the 404. `app/error.tsx` and `app/global-error.tsx` are the 500 surfaces. Public campaigns and influencers have titles, `app/robots.ts`, and `app/sitemap.ts`.
- **Crons.** `vercel.json` calls `GET /api/jobs/settle-rewards` daily at 02:00 UTC and `GET /api/jobs/housekeeping` daily at 05:00 UTC. Housekeeping ends active or paused campaigns whose end date has passed, returns unused funded budget and the unused fee once, and cancels booking requests that have sat for 14 days, returning that escrow. It does not read social networks. Production requires `CRON_SECRET`. View checks stay manual between those runs.
- **Manual money, unchanged.** Brands still record deposits themselves. Admins still mark withdrawals paid. Ledger rows are still written in the same store update as the balance change, and a second mark-paid or reject in the same write is ignored.

## Gotlieb provides

| Item | What to do |
| --- | --- |
| Supabase project | Create it. Do not point this repo at an existing production database from CI. |
| SQL | Run the migrations in `supabase/migrations` in filename order in the SQL editor, including `20261017160000_production_hardening.sql` and `20261017180000_platform_collections.sql`. Skip `20260829000000_init.sql` (outline only) and the avatars bucket until Storage exists. Then, if you want the new checks enforced on old rows: `alter table public.fweta_wallets validate constraint fweta_wallets_balances_nonnegative;` and the same for `fweta_ledger_amount_positive`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key only. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key. Never `NEXT_PUBLIC_`. |
| `AUTH_SECRET` | `openssl rand -base64 32`. Not the old example string. |
| `PAYOUT_ENCRYPTION_KEY` | A different random value. Rotating it makes existing bank ciphertext unreadable. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Real admin login. Password at least 8 characters. |
| `CRON_SECRET` | Random. Vercel Cron sends it as `Authorization: Bearer` on the housekeeping route. The health write-probe uses the same secret. |
| `NEXT_PUBLIC_APP_URL` | `https://app.fweta.com` |
| `RESEND_API_KEY` | Resend API key. Server only. |
| `RESEND_FROM` | Address on a domain verified in Resend, for example `fweta <notifications@fweta.com>`. |
| Domain and DNS | `app.fweta.com` on the Vercel project. Marketing stays on fweta.com. |
| Vercel plan | Both crons run once a day: `settle-rewards` at 02:00 UTC and `housekeeping` at 05:00 UTC. That matches the Hobby once-a-day limit. |
| Demo data | If `*@fweta.test` / `password123` is already in production, delete those profiles. |
| Legal | Counsel reviews `/legal/terms`, `/legal/privacy`, and `/legal/creator-terms` before they are treated as final. |
| Optional | `ERROR_WEBHOOK_URL` for an error sink. `FWETA_RELATIONAL_SYNC=true` only after the hardening migration, and only if you want the relational copy. Leave it unset to keep the JSON document as the source of truth. |

## Later

- Apply for a TikTok developer app and a Meta developer app.
- After those apps are approved, enable the official providers so view counts can come from TikTok and Meta instead of the admin form.
- Until then, keep entering counts at `/dashboard/admin/views`.

## Leave unset

- Payment gateway keys. Deposits and payouts are manual.
- `APIFY_API_TOKEN` and any TikTok, Meta, Instagram, YouTube, or X API keys. View counts are manual.
- `FWETA_SEED_DEMO` on production.
- `TRIGGER_SECRET_KEY` until a job runner is actually wired. Housekeeping uses the Vercel cron route.

## Already merged here

Notifications, content-reward settlement, onboarding, workspaces, and this production checklist are on the same branch. Settlement still returns unused budget and fee, and a later earnings pass must not spend a campaign that already has `settledAt`.

## After deploy

1. `GET /api/health/store` returns `"ok": true` and `"mode": "supabase"`.
2. Sign in as the env admin, record a manual deposit, redeploy or open a second session, and confirm the balance is still there.
3. `POST /api/webhooks` returns 404. That is intentional.
4. `GET /api/jobs/housekeeping` with the cron bearer returns `"ok": true`. `GET /api/jobs/poll-views` with the bearer returns 410. Without the bearer, both return 401.
