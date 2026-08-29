# Content Rewards Platform — Phased Build Plan

This document expands [AGENTS.md](./AGENTS.md) into an actionable build sequence from scaffold through full platform. Each phase lists deliverables, routes, and exit criteria.

**Current stage:** Phases 0–14 implemented for local MVP (file-backed store + cookie auth). Supabase SSR clients and env are wired; data still lives in the file store until auth/data migrate. Schema concepts match AGENTS.md.

---

## Overview

| Phase | Name | Goal | Status |
|-------|------|------|--------|
| 0 | Scaffold | Next.js, Tailwind, folder structure, dev server | Done |
| 1 | Auth & Foundation | Auth, roles, profiles, basic dashboards | Done (local auth) |
| 2 | Campaigns (Brand) | Campaign CRUD, budget, CPM rules | Done |
| 3 | Submissions (Clipper) | Submit links, brand review, manual approval | Done |
| 4 | Wallet & Payouts | Ledger, payout methods, withdrawals, admin queue | Done |
| 5 | Influencer Profiles | Public profiles, rate cards, SEO pages | Done |
| 6 | Bookings | Brand → influencer hire flow, escrow | Done (request/accept) |
| 7 | Automation | View polling, CPM earnings, notifications | Done (job API) |
| 8 | Public Marketplace | Campaign + influencer discovery, search, filters | Done |
| 9 | Settings & Account | Profile, roles, notifications, security | Done |
| 10 | Brand Portal (full) | Spend analytics, deposits | Done |
| 11 | Creator Portals (full) | Clipper + influencer earnings | Done |
| 12 | Admin Portal (full) | Fraud, stats, users, withdrawals | Done |
| 13 | Payments & Deposits | PayFast/Stripe (optional) | Stub |
| 14 | Moat | AI review, fraud, analytics | Partial (fraud queue) |

---

## Local runtime notes

- **Auth:** Cookie JWT (`fweta_session`) with bcrypt passwords. Demo users seeded on first load (`*@fweta.test` / `password123`).
- **Data:** File store at `data/store.json` (gitignored). Ledger discipline enforced in `lib/wallet/ledger.ts`.
- **Jobs:** `POST /api/jobs/poll-views` runs view growth simulation + CPM earnings.
- **Booking model:** Request → accept/decline → deliver → brand approve (documented decision: not instant book).
- **Currency:** NAD (Namibia). Minimum withdrawal N$100.
- **Design:** fweta marketing language — white / black / gold, Instrument Serif + DM Sans.

When migrating to Supabase: replace `lib/db/store.ts` and `lib/auth/session.ts` with Supabase clients; keep Zod schemas and UI.

---

## Phase details

See git history and routes under `/app` for full deliverables. Original phase checklists below remain the product contract.

## Phase 0 — Scaffold

**Goal:** Runnable Next.js 15+ app with App Router, TypeScript, Tailwind, and route stubs.

### Deliverables
- [x] `package.json` with Next.js, React, TypeScript, Tailwind, ESLint
- [x] App Router structure per AGENTS.md
- [x] `npm install` succeeds; `next` binary in `node_modules/.bin`
- [x] `npm run dev` serves on `http://localhost:3000`
- [x] UI primitives (Button, Input, Card, Form shells)

### Exit criteria
- Dev server runs without errors
- All stub pages render
- Lint passes

---

## Phase 1 — Auth & Foundation

**Goal:** Users can sign up, log in, and land on the correct dashboard by role.

### Deliverables
- [x] Auth pages: `/login`, `/signup`
- [x] Profiles with roles (`brand`, `influencer`, `clipper`, `admin`)
- [x] Role selection on signup; primary-role switcher
- [x] Protected `/dashboard/*` middleware
- [x] Design-system components

### Exit criteria
- Email/password auth works end-to-end
- Middleware redirects unauthenticated users to `/login`
- Profile row created on signup; roles stored and enforced

---

## Phase 2 — Campaigns (Brand Portal)

### Exit criteria
- Brand can CRUD campaigns
- Only campaign owner (or admin) can edit
- Campaign status lifecycle: draft → active → paused → completed

---

## Phase 3 — Submissions (Clipper Flow)

### Exit criteria
- Clipper can submit links per campaign
- Brand can approve/reject/flag with optional note

---

## Phase 4 — Wallet & Payouts

### Exit criteria
- Every balance change has a matching `ledger_entries` row
- Creator can add payout method and request withdrawal
- Admin can mark withdrawal paid
- Bank details encrypted at rest; masked in creator UI

---

## Phase 5 — Influencer Profiles & Rate Cards

### Exit criteria
- Influencer profile is public and indexable
- Rate cards display on profile; only owner can edit

---

## Phase 6 — Bookings

**Decision:** request/accept (not instant book). Escrow on request; release on brand approval.

### Exit criteria
- Full booking lifecycle works with wallet escrow

---

## Phase 7 — Automation

### Exit criteria
- `POST /api/jobs/poll-views` creates snapshots and credits CPM earnings
- Budget exhaustion ends campaign

---

## Phase 8 — Public Marketplace

### Exit criteria
- Unauthenticated users can browse campaigns and influencers

---

## Phase 9 — Settings & Account

### Exit criteria
- Single settings hub for profile, roles, notifications, security, wallet, payout

---

## Phases 10–12 — Full portals

### Exit criteria
- Brand analytics + deposits; creator earnings; admin users/fraud/stats

---

## Phase 13 — Payments & Deposits (Optional)

- [x] Webhook stub under `/api/webhooks`
- [ ] PayFast/Stripe live integration

---

## Phase 14 — Moat

- [x] Fraud review queue (manual flags)
- [ ] AI-assisted content review
- [ ] Advanced anomaly detection

---

## Open Decisions (resolved for v1)

| Decision | Choice |
|----------|--------|
| Platform name | **fweta** |
| Niche | African creators · Windhoek-built |
| Brand deposit | Manual credit v1 |
| Influencer booking | Request/accept |
| Auto-approve submissions | Manual only v1 |
| Minimum withdrawal | N$100 |
| Currency | NAD (ZAR-compatible EFT fields) |
