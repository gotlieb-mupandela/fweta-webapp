# fweta app

Product workspace for campaigns, influencer bookings, and payouts.

**Production:** https://app.fweta.com  
**Marketing site:** https://fweta.com (separate repo)

This app starts at **auth** (`/` → login or dashboard). It is not the marketing landing page.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- File/memory store locally & on Vercel (`/tmp`) + cookie auth for MVP
- Supabase SSR clients (`@supabase/ssr`) — set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`
- Zod validation + server actions

## Quick start

```bash
npm install
npm run dev
```

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
