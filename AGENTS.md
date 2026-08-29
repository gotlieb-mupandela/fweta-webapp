# Content Rewards Platform — Agent Guide

This document is the single source of truth for AI agents and developers working on this project. Read this before making architectural or product decisions.

---

## One-Line Pitch

A two-sided creator economy marketplace where **brands pay for distribution**, **influencers set their own rates**, and **clippers earn per verified view** — all on one platform.

---

## Product Vision

Combine two models that competitors usually split:

1. **Content Rewards (campaigns)** — Brands set CPM + budget; open marketplace for clippers (Whop/Vyro model).
2. **Influencer Marketplace** — Influencers set rate cards; brands book them directly (Collabstr/Billo model).

**Positioning:** Brands choose **volume** (open campaigns) or **trust** (booked influencers), or both, in one product.

---

## User Types

| Role | Description | Can overlap? |
|------|-------------|--------------|
| **Brand** | Funds campaigns, hires influencers, reviews submissions, deposits budget | — |
| **Influencer** | Public profile, rate card, accepts bookings, delivers sponsored content | Yes — can also clip campaigns |
| **Clipper** | Joins open campaigns, submits clips/UGC, earns per view | Yes — may also be an influencer |
| **Admin** | Manual payout queue, platform oversight, fraud review | Internal only |

A single account may hold multiple roles (e.g. influencer who also joins clipping campaigns).

---

## Core Product Flows

### Flow A: Content Rewards Campaign (brand sets price)

```
Brand creates campaign → deposits budget → sets CPM + rules
  → Clippers discover campaign → post to social → submit link
  → Review (manual / AI / auto-approve after 48h)
  → Views polled hourly (background job)
  → Earnings credited to clipper wallet
  → Clipper requests withdrawal → admin pays manually via EFT
```

**Campaign types:**
- **Clipping** — Repurpose brand's long-form content (podcasts, streams) into short clips.
- **UGC** — Original content featuring the brand per guidelines.

**Qualified view rules (target behavior):**
- Unique views from allowed platforms (TikTok, YouTube Shorts, Instagram Reels, X).
- Exclude bot/fraud/paid promotion views.
- Pay until campaign budget exhausted or end date reached.
- Per-video max payout cap to spread budget across creators.

### Flow B: Influencer Marketplace (influencer sets price)

```
Influencer creates profile + rate card → brand browses → books at listed rate
  → Influencer accepts → delivers content → brand approves
  → Escrow released to influencer wallet
  → Influencer requests withdrawal → admin pays manually via EFT
```

**Rate card examples:** per TikTok post, per Reel, per 1K views floor, monthly package, UGC flat fee.

### Flow C: Manual Payout (admin)

```
Creator adds payout method (bank details) → requests withdrawal from wallet balance
  → Admin receives notification → processes EFT manually
  → Admin marks withdrawal as paid (optional bank reference)
  → Creator notified
```

**Payout method fields (SA EFT — match Salt-style UI):**
- Bank name
- Branch code (6 digits)
- Account number
- Account holder name
- Account type (cheque / savings / transmission)

**Security:** Encrypt bank details at rest. Mask in UI. Restrict admin access. Comply with POPIA.

---

## Tech Stack (decided)

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 15** (App Router) | React + SSR for SEO on public pages |
| Language | **TypeScript** | Required for money/campaign logic |
| Styling | **Tailwind CSS + shadcn/ui** | Consistent dashboard UI |
| Database | **Supabase** (PostgreSQL) | Auth, RLS, Storage, Realtime |
| Forms | **React Hook Form + Zod** | Shared validation schemas (UI + API) |
| Background jobs | **Trigger.dev** or **Inngest** | View polling, admin notifications |
| Creator payouts | **Manual EFT** (v1) | No Stripe Connect for creators initially |
| Brand deposits | **Manual or PayFast/Stripe** (later) | Optional for v1 |
| Hosting | **Vercel** | Next.js native deploy |

### Why Supabase over Convex

Relational money flows (ledger, escrow balances, withdrawals), complex reporting, and time-series view snapshots favor PostgreSQL.

### Why Next.js over plain React (Vite)

Public SEO pages (influencer profiles, campaign browse), API routes for future webhooks, Supabase SSR auth patterns.

---

## Background Jobs ("Jobs")

Jobs are **scheduled or event-driven tasks** that run without user interaction.

| Job | Schedule / trigger | Purpose |
|-----|-------------------|---------|
| `poll-submission-views` | Every hour (cron) | Fetch view counts from social APIs; store snapshots |
| `recalculate-earnings` | After view update | Update wallet balances from CPM math |
| `notify-admin-withdrawal` | On withdrawal request | Alert admin dashboard + optional email |
| `notify-creator-paid` | On admin marks paid | Email creator confirmation |
| `budget-alerts` | After earnings update | Warn brand when campaign budget low |

**Free tiers:** Inngest (~50K runs/mo) and Trigger.dev (~$5 credits/mo) are sufficient for MVP.

**Do not** run view polling only in client-side `setInterval` — use a job runner.

---

## Forms (React Hook Form + Zod)

- **Zod** defines validation rules once (shared between forms and API).
- **React Hook Form** handles form state and submission.

Key forms:
- Payout method (bank details)
- Withdrawal request
- Campaign create/edit
- Influencer rate card
- Booking request
- Submission link submit
- Admin: mark withdrawal paid

Pattern: define `z.object()` schema → `zodResolver` in `useForm` → submit to Supabase via server action or API route.

---

## Suggested App Structure

```
/app
  /(marketing)           # Homepage, pricing, how it works
  /campaigns             # Browse campaigns (public)
  /influencers           # Browse + profile pages (public, SEO)
  /dashboard
    /brand               # Campaigns, submissions, spend
    /influencer          # Rate card, bookings, earnings
    /clipper             # Submissions, earnings
    /admin               # Withdrawal queue, platform stats
  /api
    /webhooks            # Future: payment webhooks
/lib
  /supabase              # Client, server, middleware
  /validations           # Zod schemas
  /jobs                  # Trigger.dev / Inngest functions
/components
```

---

## Database Concepts (Supabase)

Core entities to implement:

| Entity | Purpose |
|--------|---------|
| `profiles` | User profile; role(s): brand, influencer, clipper, admin |
| `campaigns` | Content Rewards campaigns (CPM, budget, rules, status) |
| `submissions` | Clipper posts linked to campaigns |
| `view_snapshots` | Time-series view counts per submission |
| `influencer_profiles` | Public influencer data + linked socials |
| `rate_cards` | Influencer pricing offerings |
| `bookings` | Brand → influencer hire requests |
| `wallets` | User balance (available, pending) |
| `payout_methods` | Encrypted bank details |
| `withdrawal_requests` | Payout queue for admin |
| `ledger_entries` | Append-only money audit trail (credits/debits) |

**Money rule:** Never update balance without a matching `ledger_entries` row. Use transactions for atomic updates.

---

## MVP Phases

### Phase 1 — Foundation
- Auth (Supabase), roles, basic dashboards
- Campaign CRUD (brand)
- Submission submit + manual review
- Wallet balance (manual admin credit for testing)
- Payout method form + withdrawal request
- Admin withdrawal queue (manual mark paid)

### Phase 2 — Influencers
- Influencer profiles + rate cards
- Booking flow (request → accept → deliver → approve)
- Booking payments to wallet

### Phase 3 — Automation
- Background view polling (Trigger.dev/Inngest)
- Auto earnings calculation from CPM
- Admin notifications on withdrawal

### Phase 4 — Marketplace
- Public discovery (campaigns + influencers)
- Ratings, search, filters

### Phase 5 — Moat
- AI content review, fraud detection, analytics, optional white-label

---

## Business Model (future)

| Stream | Mechanism |
|--------|-----------|
| Campaign fee | % of brand deposits (e.g. 9–10%) |
| Booking fee | % of influencer transactions (e.g. 10–15%) |
| Withdrawal fee | % on creator payouts (e.g. 7%) |

Not required for MVP — track in product design for later.

---

## Competitor Reference

| Platform | Model | Gap we fill |
|----------|-------|-------------|
| Whop Content Rewards | Brand-set CPM campaigns | + influencer rate cards |
| Vyro | Clipping campaigns | + influencer booking |
| Collabstr / Billo | Hire influencers flat-rate | + pay-per-view campaigns |
| ClipAffiliates | API-verified clipping | + influencer layer |

---

## Coding Conventions for Agents

1. **Minimize scope** — Small, focused diffs. No unrelated changes.
2. **Match existing patterns** — Read surrounding code before adding.
3. **TypeScript strict** — No `any` on money or campaign logic.
4. **Validate with Zod** — Server and client for all writes.
5. **RLS on Supabase** — Users only see their own data; admin role for payout queue.
6. **Never log bank details** — Payout methods are sensitive.
7. **Ledger discipline** — Balance changes always paired with ledger entries.
8. **Comments** — Only for non-obvious business rules (CPM math, budget caps).
9. **No commits** unless the user explicitly asks.
10. **Public pages** — Use Server Components where possible for SEO.

---

## Environment Variables (expected)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=    # legacy alias
SUPABASE_SERVICE_ROLE_KEY=          # Server only — never expose
TRIGGER_SECRET_KEY=                 # Or INNGEST_* keys
# Future: social API keys for view polling
# Future: Stripe/PayFast for brand deposits
```

---

## Open Product Decisions

| Decision | Resolution |
|----------|------------|
| Platform name | **fweta** |
| Niche | African creators · Windhoek-built · Namibia |
| Brand deposit | Manual credit v1 (gateway Phase 13) |
| Influencer booking | Request / accept (not instant book) |
| Auto-approve submissions | Manual only in v1 |
| Minimum withdrawal | N$100 |
| Currency / countries | NAD · SA-style EFT fields |

---

## Status

**Current stage:** Local MVP complete across Phases 0–12 (+ stubs for 13–14). File-backed store and cookie auth power the app until Supabase is connected. See **[PHASE.md](./PHASE.md)**.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
