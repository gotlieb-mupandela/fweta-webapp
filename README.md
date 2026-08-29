# fweta app

Product workspace for campaigns, influencer bookings, and payouts.

**Production:** https://app.fweta.com  
**Marketing site:** https://fweta.com (separate repo)

This app starts at **auth** (`/` → login or dashboard). It is not the marketing landing page.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase Auth + Postgres (SSR clients via `@supabase/ssr`)
- Zod validation + server actions

## Quick start

Copy `.env.example` to `.env.local` and set the Supabase URL, publishable key, and service role key.

```bash
npm install
npm run dev
```

Vercel also needs `SUPABASE_SERVICE_ROLE_KEY` (demo seed + jobs) and `JOBS_SECRET` (`POST /api/jobs/poll-views`).

### Demo accounts

Password for all: `password123`

| Email | Roles |
|-------|-------|
| brand@fweta.test | Brand |
| creator@fweta.test | Influencer + Clipper |
| clipper@fweta.test | Clipper |
| admin@fweta.test | Admin |

## Docs

- [AGENTS.md](./AGENTS.md) — product & architecture
- [PHASE.md](./PHASE.md) — phased build status
