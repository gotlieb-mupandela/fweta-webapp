# fweta — Production setup checklist

The app **UI and flows are built** (Phases 0–12). What’s missing is mostly **infrastructure wiring** so data survives deploys and automation runs.

Use this as your single checklist. Tick items in order.

---

## Status at a glance

| Area | Built in code? | Configured on Vercel/Supabase? |
|------|----------------|--------------------------------|
| Auth (email + password) | Yes | Needs `AUTH_SECRET` |
| Dashboards (brand/clipper/influencer/admin) | Yes | Works after auth |
| **Data persistence** | Yes (Supabase JSON blob) | **Often broken — see §1** |
| Wallet, deposits, campaigns | Yes | Depends on persistence |
| Influencer bookings + escrow | Yes | Depends on persistence |
| Manual withdrawals (admin EFT) | Yes | Depends on persistence |
| Admin view counts | Yes | Entered at `/dashboard/admin/views` |
| Vercel Cron (daily housekeeping) | Yes | Daily schedule works on Hobby. Needs `CRON_SECRET` |
| Trigger.dev | Not wired in code | Optional — cron route is enough |
| Brand deposits and creator payouts | Manual, in the product | No payment gateway |
| Supabase Auth (replace cookie auth) | Not built | Future migration |
| Email notifications | Yes (Resend) | Needs `RESEND_API_KEY` and `RESEND_FROM` |
| Official TikTok / Meta view APIs | Not enabled | Later, after developer apps are approved. Apify is optional. |

**Production health check:** `https://app.fweta.com/api/health/store`  
You want `"ok": true` and `"profileCount" >= 4` after first login.

---

## 1. Supabase (required for production)

Without this, **every deploy forgets your data** (deposits, campaigns, users).

### 1a. Run SQL migrations (Supabase → SQL Editor)

Run **in order**, paste full file contents:

1. `supabase/migrations/20260829140000_fweta_app_store.sql` — JSON store (required)
2. `supabase/migrations/20260829150000_fweta_full_schema.sql` — relational tables
3. `supabase/migrations/20260830153000_fweta_app_store_grants.sql` — service role grants
4. `supabase/migrations/20260913140000_avatars_bucket.sql` — avatar storage
5. `supabase/migrations/20261017160000_production_hardening.sql` — profile columns, campaign `settled_at`, ledger checks, revoke anon access to the store functions

Do not apply these from the app. Paste them in the Supabase SQL editor for the project you create. The hardening migration refuses to replace a populated relational store with an empty profile list, and it revokes `anon` / `authenticated` execute on `fweta_load_store` and `fweta_save_store`.

After running #1, verify:

```sql
select id, updated_at from public.fweta_app_store;
-- Should return 0 or 1 row, not an error
```

### 1b. API keys (Supabase → Settings → API)

| Variable | Where | Notes |
|----------|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Same as `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Publishable** key (`sb_publishable_…`) | Safe for browser |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** key (`sb_secret_…` or legacy `eyJ…`) | **Never** expose to client |

**Common mistake:** putting the publishable key in `SUPABASE_SERVICE_ROLE_KEY`. Saves silently fail and data disappears.

### 1c. Optional: relational sync

Leave **unset** unless you’ve run migration #2 and want table-level data:

```
FWETA_RELATIONAL_SYNC=true
```

Default (unset) = JSON blob only — safer for MVP.

---

## 2. Vercel environment variables

**Project → Settings → Environment Variables** (Production + Preview).

| Variable | Type | How to get |
|----------|------|------------|
| `AUTH_SECRET` | Secret | `openssl rand -base64 32` |
| `PAYOUT_ENCRYPTION_KEY` | Secret | `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Plain | Admin login email. Seeded on the login page. |
| `ADMIN_PASSWORD` | **Secret** | Admin password (8+ characters). Bcrypt-hashed at seed time. |
| `NEXT_PUBLIC_SUPABASE_URL` | Plain | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Plain | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Supabase **secret** service role key |
| `NEXT_PUBLIC_APP_URL` | Plain | `https://app.fweta.com` |
| `CRON_SECRET` | Secret | `openssl rand -base64 32` |
| `RESEND_API_KEY` | **Secret** | [Resend API keys](https://resend.com/api-keys) |
| `RESEND_FROM` | Plain | Address on a verified Resend domain, e.g. `fweta <notifications@fweta.com>` |
| `APIFY_API_TOKEN` | Secret | Optional. Leave unset and an admin enters view counts. |

**Not needed yet:** `TRIGGER_SECRET_KEY`. Housekeeping uses Vercel Cron. Leave payment gateway keys unset.

After changing env vars → **Redeploy** (Deployments → … → Redeploy).

### Resend domain

1. In Resend, open **Domains** and add the domain you will send from (for example `fweta.com` or `mail.fweta.com`).
2. Add the DNS records Resend shows (SPF, DKIM, and the return-path record if one is listed).
3. Wait until the domain status is **Verified**.
4. Set `RESEND_FROM` to an address on that domain, such as `fweta <notifications@fweta.com>`.
5. Set `RESEND_API_KEY` to an API key that can send mail. Keep it server-only.
6. Set both on Vercel Production and Preview, then redeploy.
7. `NEXT_PUBLIC_APP_URL` should be `https://app.fweta.com` so email links and the logo resolve.

If either Resend variable is missing, fweta skips the send and logs a warning. In-app notifications still save. Admins can review every template at `/dashboard/admin/emails` without sending.

---

## 3. Vercel Cron

- `vercel.json` schedules `0 2 * * *` to `/api/jobs/settle-rewards` and `0 5 * * *` to `/api/jobs/housekeeping`.
- Settle closes ended campaigns, splits a pool, and releases holds. It does not fetch views.
- Housekeeping does the same close once a day and releases booking requests older than 14 days.
- View counts are entered by an admin unless `APIFY_API_TOKEN` is set. Without it, `/api/jobs/poll-views` returns 410.
- Both schedules are once a day, which is what the Hobby plan allows.
- Cron sends `Authorization: Bearer <CRON_SECRET>`, which must match the env var.

**Manual test** (replace the secret):

```bash
curl -X POST "https://app.fweta.com/api/jobs/settle-rewards" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
curl -X POST "https://app.fweta.com/api/jobs/housekeeping" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```
---

## 4. Demo logins (local only)

These accounts are seeded on the login page **outside production**. Production does not create them unless `FWETA_SEED_DEMO=true`.

| Email | Role | Password |
|-------|------|----------|
| `brand@fweta.test` | Brand | `password123` |
| `clipper@fweta.test` | Clipper | `password123` |
| `creator@fweta.test` | Influencer + clipper | `password123` |

Admin login is **not** a shared password. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment (local `.env.local`, and Production + Preview on Vercel). The login page hashes `ADMIN_PASSWORD` and creates or updates that admin account. Until those variables are set, no admin is created. If demo accounts were already written to production, delete the `*@fweta.test` profiles before go-live.

---

## 5. Verify production (5 minutes)

1. Open `https://app.fweta.com/api/health/store`  
   - Expect `"ok": true`, `"mode": "supabase"`, `"checks.jsonBlobLoad": "ok"`
   - The public check does not write. A save probe is `?probe=1` with `Authorization: Bearer CRON_SECRET`
2. Log in with `ADMIN_EMAIL`
3. As a brand (or a brand you create), **Deposits** → record a manual amount
4. Log out, log in again → the wallet should still show that credit  
   - If it reset → persistence is still broken (re-check §1)
5. **New campaign** → set budget, launch active  
   - Wallet should decrease by the budget amount

---

## 6. Not built yet (don’t expect these to work)

- **Payment gateway** — owner decision: brand deposits stay manual, creator payouts stay manual EFT. `/api/webhooks` does not accept gateway events.
- **Trigger.dev** scheduled jobs (use Vercel Cron instead)
- **Supabase Auth** (still cookie auth + `password_hash` in store)
- **AI** content review
- **Automatic view counts.** An admin enters them. Later: apply for TikTok and Meta developer apps, then enable the official providers. No scraper.

---

## 7. Local development

```bash
cp .env.example .env.local
# Fill SUPABASE_SERVICE_ROLE_KEY if testing production parity
npm install
npm run dev
```

Data file: `data/store.json` (local only, gitignored).

Local health check: `http://localhost:3000/api/health/store` should return `"ok": true` and `"mode": "local"` after the first page load.

E2E scripts (with dev server running):

```bash
node scripts/e2e-brand-dashboard.mjs
node scripts/e2e-other-dashboards.mjs
node scripts/e2e-full-flow.mjs
```

---

## Quick fix if dashboard 500s

1. Confirm PR #8+ is deployed on `main`
2. Run `fweta_app_store` migration in Supabase
3. Fix `SUPABASE_SERVICE_ROLE_KEY` (must be **secret** key)
4. Redeploy Vercel
5. Hard refresh / clear cookies for `app.fweta.com`
