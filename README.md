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

| Email | Roles | Password |
|-------|-------|----------|
| brand@fweta.test | Brand | `password123` |
| creator@fweta.test | Influencer + Clipper | `password123` |
| clipper@fweta.test | Clipper | `password123` |
| hello@fweta.com | Admin | `Fweta@100%` |

## Docs

- [AGENTS.md](./AGENTS.md) — product & architecture
- [PHASE.md](./PHASE.md) — phased build status
