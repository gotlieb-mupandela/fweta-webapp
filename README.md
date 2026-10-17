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

The admin account is seeded from `ADMIN_EMAIL` and `ADMIN_PASSWORD` (bcrypt-hashed at seed time). Put both in `.env.local` for local admin login, and set the same names on Vercel. Do not commit the password.

## Docs

- [AGENTS.md](./AGENTS.md) — product & architecture
- [PHASE.md](./PHASE.md) — phased build status
- [docs/GO-LIVE.md](./docs/GO-LIVE.md) — production checklist
