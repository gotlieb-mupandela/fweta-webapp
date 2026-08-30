# fweta — Production setup checklist

The app **UI and flows are built** (Phases 0–12). What’s missing is mostly **infrastructure wiring** so data survives deploys and automation runs.

Use this as your single checklist. Tick items in order.

---

## Status at a glance

| Area | Built in code? | Configured on Vercel/Supabase? |
|------|----------------|--------------------------------|
| Auth (cookie + demo users) | Yes | Needs `AUTH_SECRET` |
| Dashboards (brand/clipper/influencer/admin) | Yes | Works after auth |
| **Data persistence** | Yes (Supabase JSON blob) | **Often broken — see §1** |
| Wallet, deposits, campaigns | Yes | Depends on persistence |
| Influencer bookings + escrow | Yes | Depends on persistence |
| Manual withdrawals (admin EFT) | Yes | Depends on persistence |
| View polling (Apify) | Yes | Needs `APIFY_API_TOKEN` |
| Vercel Cron (daily poll) | Yes | Needs **Pro** plan + `CRON_SECRET` |
| Trigger.dev | Not wired in code | Optional — cron route is enough |
| PayFast / Stripe deposits | Stub only | Phase 13 — not built |
| Supabase Auth (replace cookie auth) | Not built | Future migration |
| Email notifications | Stub | Not built |
| Real TikTok/IG/YouTube APIs | Not built | Apify used instead |

**Production health check:** `https://app.fweta.com/api/health/store`  
You want `"ok": true` and `"profileCount" >= 4` after first login.

---

## 1. Supabase (required for production)

Without this, **every deploy forgets your data** (deposits, campaigns, users).

### 1a. Run SQL migrations (Supabase → SQL Editor)

Run **in order**, paste full file contents:

1. `supabase/migrations/20260829140000_fweta_app_store.sql` — JSON store (required)
2. `supabase/migrations/20260829150000_fweta_full_schema.sql` — relational tables (optional for now)

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
| `NEXT_PUBLIC_SUPABASE_URL` | Plain | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Plain | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Supabase **secret** service role key |
| `NEXT_PUBLIC_APP_URL` | Plain | `https://app.fweta.com` |
| `CRON_SECRET` | Secret | `openssl rand -base64 32` |
| `APIFY_API_TOKEN` | Secret | [Apify → Integrations](https://console.apify.com/settings/integrations) |

**Not needed yet:** `TRIGGER_SECRET_KEY` (jobs use Vercel Cron + `/api/jobs/poll-views`).

After changing env vars → **Redeploy** (Deployments → … → Redeploy).

---

## 3. Vercel Cron (view polling + earnings)

- `vercel.json` defines daily cron: `0 5 * * *` → `/api/jobs/poll-views`
- Requires **Vercel Pro** (Crons not on Hobby)
- Cron sends `Authorization: Bearer <CRON_SECRET>` — must match env var

**Manual test** (replace secrets):

```bash
curl -X POST "https://app.fweta.com/api/jobs/poll-views" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Without `APIFY_API_TOKEN`, polling **simulates** view growth (fine for demo).

---

## 4. Demo logins (seeded on first login page load)

| Email | Role |
|-------|------|
| `brand@fweta.test` | Brand |
| `clipper@fweta.test` | Clipper |
| `creator@fweta.test` | Influencer + clipper |
| `admin@fweta.test` | Admin |

Password: `password123`

---

## 5. Verify production (5 minutes)

1. Open `https://app.fweta.com/api/health/store`  
   - Expect `"supabase": true`, `"jsonBlob": "ok"`, eventually `"profileCount": 4`
2. Log in as `brand@fweta.test`
3. **Deposits** → record N$500
4. Log out, log in again → wallet should still show N$500  
   - If **N$0** → persistence still broken (re-check §1)
5. **New campaign** → set budget, launch active  
   - Wallet should decrease by budget amount

---

## 6. Not built yet (don’t expect these to work)

- **PayFast / Stripe** brand deposits (manual “record deposit” only)
- **Trigger.dev** scheduled jobs (use Vercel Cron instead)
- **Email** on withdrawal / booking
- **Supabase Auth** (still cookie auth + `password_hash` in store)
- **AI** content review
- **Native** TikTok/Instagram/YouTube view APIs (Apify scraper used when token set)

---

## 7. Local development

```bash
cp .env.example .env.local
# Fill SUPABASE_SERVICE_ROLE_KEY if testing production parity
npm install
npm run dev
```

Data file: `data/store.json` (local only, gitignored).

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
