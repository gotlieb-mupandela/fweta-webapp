# fweta

Creator economy marketplace — brands fund campaigns, influencers set rates, clippers earn per verified view.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Local file store (`data/store.json`) + cookie auth for MVP
- Zod validation + server actions
- Design: white / black / gold · Instrument Serif + DM Sans

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts

Password for all: `password123`

| Email | Roles |
|-------|-------|
| brand@fweta.test | Brand |
| creator@fweta.test | Influencer + Clipper |
| clipper@fweta.test | Clipper |
| admin@fweta.test | Admin |

### Jobs

```bash
curl -X POST http://localhost:3000/api/jobs/poll-views
```

Simulates view growth on approved submissions and credits CPM earnings via the ledger.

## Docs

- [AGENTS.md](./AGENTS.md) — product & architecture
- [PHASE.md](./PHASE.md) — phased build status
