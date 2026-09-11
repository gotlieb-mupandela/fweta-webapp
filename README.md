# fweta app

Product workspace for campaigns, influencer bookings, and payouts.

**Production:** https://app.fweta.com  
**Marketing site:** https://fweta.com (separate repo)

This app starts at **auth** (`/` → login or dashboard). It is not the marketing landing page.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- File/memory store locally (`data/store.json`) + cookie email/password auth for MVP
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
| brand@fweta.test or brand@fweta.com | Brand |
| creator@fweta.test or creator@fweta.com | Influencer + Clipper |
| clipper@fweta.test or clipper@fweta.com | Clipper |
| admin@fweta.test or admin@fweta.com | Admin |

## Docs

- [AGENTS.md](./AGENTS.md) — product & architecture
- [PHASE.md](./PHASE.md) — phased build status
