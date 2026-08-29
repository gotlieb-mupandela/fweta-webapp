# Content Rewards Platform — Phased Build Plan

This document expands [AGENTS.md](./AGENTS.md) into an actionable build sequence from scaffold through full platform. Each phase lists deliverables, routes, and exit criteria.

**Current stage:** Phase 0 (scaffold) — Next.js app shell in place; dependencies and Supabase pending.

---

## Overview

| Phase | Name | Goal |
|-------|------|------|
| 0 | Scaffold | Next.js, Tailwind, folder structure, dev server |
| 1 | Auth & Foundation | Supabase auth, roles, profiles, basic dashboards |
| 2 | Campaigns (Brand) | Campaign CRUD, budget, CPM rules |
| 3 | Submissions (Clipper) | Submit links, brand review, manual approval |
| 4 | Wallet & Payouts | Ledger, payout methods, withdrawals, admin queue |
| 5 | Influencer Profiles | Public profiles, rate cards, SEO pages |
| 6 | Bookings | Brand → influencer hire flow, escrow |
| 7 | Automation | View polling, CPM earnings, notifications |
| 8 | Public Marketplace | Campaign + influencer discovery, search, filters |
| 9 | Settings & Account | Profile, roles, notifications, security |
| 10 | Brand Portal (full) | Spend analytics, team, deposits |
| 11 | Creator Portals (full) | Clipper + influencer earnings, history |
| 12 | Admin Portal (full) | Fraud review, platform stats, user management |
| 13 | Payments & Deposits | PayFast/Stripe brand deposits (optional v1+) |
| 14 | Moat | AI review, fraud detection, analytics, white-label |

Phases 1–4 map to **MVP Phase 1** in AGENTS.md. Phases 5–6 = MVP Phase 2. Phase 7 = MVP Phase 3. Phase 8 = MVP Phase 4. Phase 14 = MVP Phase 5.

---

## Phase 0 — Scaffold

**Goal:** Runnable Next.js 15+ app with App Router, TypeScript, Tailwind, and route stubs.

### Deliverables
- [x] `package.json` with Next.js, React, TypeScript, Tailwind, ESLint
- [x] App Router structure per AGENTS.md
- [ ] `npm install` succeeds; `next` binary in `node_modules/.bin`
- [ ] `npm run dev` serves on `http://localhost:3000`
- [ ] shadcn/ui initialized (Phase 1 UI work)

### Routes (stubs)
| Route | Purpose |
|-------|---------|
| `/(marketing)` | Homepage, pricing, how it works |
| `/campaigns` | Public campaign browse (stub) |
| `/influencers` | Public influencer browse (stub) |
| `/dashboard/brand` | Brand dashboard stub |
| `/dashboard/influencer` | Influencer dashboard stub |
| `/dashboard/clipper` | Clipper dashboard stub |
| `/dashboard/admin` | Admin dashboard stub |
| `/api/webhooks` | Webhook placeholder |

### Exit criteria
- Dev server runs without errors
- All stub pages render
- Lint passes

---

## Phase 1 — Auth & Foundation

**Goal:** Users can sign up, log in, and land on the correct dashboard by role.

### Deliverables
- Supabase project + env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- Database migration: `profiles` table with roles (`brand`, `influencer`, `clipper`, `admin`)
- RLS policies on `profiles`
- Supabase SSR clients (`/lib/supabase/client.ts`, `server.ts`, middleware)
- Auth pages: `/login`, `/signup`, `/auth/callback`
- Role selection on first login (multi-role support)
- Protected `/dashboard/*` layout with role-based nav
- shadcn/ui base components (Button, Input, Card, Form)

### Routes
| Route | Access |
|-------|--------|
| `/login` | Public |
| `/signup` | Public |
| `/auth/callback` | Auth handler |
| `/dashboard` | Redirect by primary role |
| `/dashboard/brand` | Brand role |
| `/dashboard/influencer` | Influencer role |
| `/dashboard/clipper` | Clipper role |
| `/dashboard/admin` | Admin role |

### Exit criteria
- Email/password auth works end-to-end
- Middleware redirects unauthenticated users to `/login`
- Profile row created on signup; roles stored and enforced

---

## Phase 2 — Campaigns (Brand Portal)

**Goal:** Brands create and manage Content Rewards campaigns.

### Deliverables
- Migration: `campaigns` table (CPM, budget, rules, status, type: clipping/UGC)
- Zod schema: campaign create/edit
- Brand UI: campaign list, create, edit, pause/archive
- Campaign detail page (brand view)
- Budget tracking field (`budget_total`, `budget_spent`)

### Routes
| Route | Access |
|-------|--------|
| `/dashboard/brand/campaigns` | Brand |
| `/dashboard/brand/campaigns/new` | Brand |
| `/dashboard/brand/campaigns/[id]` | Brand (owner) |
| `/dashboard/brand/campaigns/[id]/edit` | Brand (owner) |

### Exit criteria
- Brand can CRUD campaigns
- Only campaign owner (or admin) can edit
- Campaign status lifecycle: draft → active → paused → ended

---

## Phase 3 — Submissions (Clipper Flow)

**Goal:** Clippers discover campaigns, submit post links, brands review.

### Deliverables
- Migration: `submissions` table (campaign_id, clipper_id, url, platform, status)
- Zod schema: submission link submit
- Clipper UI: browse active campaigns, submit link, view submission status
- Brand UI: submission queue per campaign, approve/reject
- Manual review only in v1 (auto-approve after 48h = TBD)

### Routes
| Route | Access |
|-------|--------|
| `/dashboard/clipper/campaigns` | Clipper |
| `/dashboard/clipper/submissions` | Clipper |
| `/dashboard/brand/campaigns/[id]/submissions` | Brand (owner) |

### Exit criteria
- Clipper can submit one or more links per campaign (per rules)
- Brand can approve/reject with optional note
- RLS: clippers see own submissions; brands see submissions on their campaigns

---

## Phase 4 — Wallet & Payouts

**Goal:** Money flows with ledger discipline; creators can request withdrawal; admin pays manually.

### Deliverables
- Migrations: `wallets`, `ledger_entries`, `payout_methods`, `withdrawal_requests`
- Encrypt payout method bank details at rest; mask in UI
- Zod schemas: payout method, withdrawal request
- Wallet balance display (available, pending)
- Manual admin credit for testing (server action or admin UI)
- Admin withdrawal queue: list, mark paid, bank reference
- SA EFT fields: bank name, branch code (6 digits), account number, holder name, account type

### Routes
| Route | Access |
|-------|--------|
| `/dashboard/settings/payout` | Creator (influencer/clipper) |
| `/dashboard/settings/wallet` | Creator |
| `/dashboard/settings/withdraw` | Creator |
| `/dashboard/admin/withdrawals` | Admin |

### Exit criteria
- Every balance change has a matching `ledger_entries` row (transactional)
- Creator can add payout method and request withdrawal
- Admin can mark withdrawal paid; creator sees updated status
- Bank details never logged; POPIA-aware access controls

---

## Phase 5 — Influencer Profiles & Rate Cards

**Goal:** Influencers publish profiles; brands can browse publicly.

### Deliverables
- Migrations: `influencer_profiles`, `rate_cards`
- Public SEO pages for influencer profiles
- Influencer dashboard: edit profile, manage rate cards
- Zod schemas: profile, rate card
- Rate card types: per post, per Reel, per 1K views floor, package, UGC flat fee

### Routes
| Route | Access |
|-------|--------|
| `/influencers` | Public |
| `/influencers/[slug]` | Public (SEO) |
| `/dashboard/influencer/profile` | Influencer |
| `/dashboard/influencer/rate-cards` | Influencer |

### Exit criteria
- Influencer profile is public and indexable
- Rate cards display on profile; only owner can edit

---

## Phase 6 — Bookings

**Goal:** Brands book influencers at listed rates; escrow releases on approval.

### Deliverables
- Migration: `bookings` (brand, influencer, rate_card, status, amount)
- Booking flow: request → accept/decline → deliver → brand approve
- Escrow: hold amount in pending wallet until approval
- Ledger entries for booking payment and release

### Routes
| Route | Access |
|-------|--------|
| `/influencers/[slug]/book` | Brand |
| `/dashboard/brand/bookings` | Brand |
| `/dashboard/influencer/bookings` | Influencer |

### Exit criteria
- Full booking lifecycle works with wallet escrow
- Instant book vs request/accept — document decision in AGENTS.md when resolved

---

## Phase 7 — Automation (Background Jobs)

**Goal:** View polling and earnings without manual intervention.

### Deliverables
- Trigger.dev or Inngest setup
- Migration: `view_snapshots` (time-series per submission)
- Jobs: `poll-submission-views` (hourly), `recalculate-earnings`, `budget-alerts`
- Jobs: `notify-admin-withdrawal`, `notify-creator-paid`
- CPM math: qualified views → earnings, per-video cap, budget exhaustion

### Exit criteria
- Approved submissions get hourly view snapshots
- Earnings credited to clipper wallet via ledger
- Brand alerted when campaign budget low
- No client-side-only polling for production

---

## Phase 8 — Public Marketplace

**Goal:** Discovery for campaigns and influencers.

### Deliverables
- Public `/campaigns` with filters (platform, CPM, niche, status)
- Enhanced `/influencers` with search and filters
- Optional ratings/reviews (schema TBD)
- Server Components for SEO

### Routes
| Route | Access |
|-------|--------|
| `/campaigns` | Public |
| `/campaigns/[id]` | Public (campaign detail) |
| `/influencers` | Public |

### Exit criteria
- Unauthenticated users can browse and view detail pages
- Authenticated clippers/brands can act from public pages (CTA to dashboard)

---

## Phase 9 — Settings & Account

**Goal:** Unified account management across all roles.

### Deliverables
- `/dashboard/settings` layout with sections
- Profile: display name, avatar, bio
- Roles: enable/disable clipper, influencer, brand modes on one account
- Notifications preferences (email toggles)
- Security: change password, sessions (Supabase)
- Payout + wallet (links to Phase 4 screens)

### Routes
| Route | Access |
|-------|--------|
| `/dashboard/settings` | Authenticated |
| `/dashboard/settings/profile` | Authenticated |
| `/dashboard/settings/roles` | Authenticated |
| `/dashboard/settings/notifications` | Authenticated |
| `/dashboard/settings/security` | Authenticated |
| `/dashboard/settings/payout` | Creator |
| `/dashboard/settings/wallet` | Creator |

### Exit criteria
- Single settings hub for all user types
- Multi-role users can switch context or see combined nav

---

## Phase 10 — Brand Portal (Full)

**Goal:** Complete brand operations beyond campaign CRUD.

### Deliverables
- Spend dashboard: budget vs spent, per-campaign breakdown
- Submission analytics: views, approvals, top clippers
- Deposit flow stub (manual credit v1; gateway in Phase 13)
- Campaign duplication and templates
- Optional: team members / brand org (TBD)

### Routes
| Route | Access |
|-------|--------|
| `/dashboard/brand` | Brand (overview) |
| `/dashboard/brand/analytics` | Brand |
| `/dashboard/brand/deposits` | Brand |

### Exit criteria
- Brand has operational visibility into spend and campaign performance

---

## Phase 11 — Creator Portals (Full)

**Goal:** Rich clipper and influencer dashboards.

### Clipper
- Earnings history, per-submission breakdown
- Active campaigns and submission pipeline
- Leaderboard or campaign rankings (optional)

### Influencer
- Booking calendar/history
- Earnings from bookings vs clipping (if dual role)
- Portfolio / featured work on public profile

### Routes
| Route | Access |
|-------|--------|
| `/dashboard/clipper` | Clipper |
| `/dashboard/clipper/earnings` | Clipper |
| `/dashboard/influencer` | Influencer |
| `/dashboard/influencer/earnings` | Influencer |

### Exit criteria
- Creators see full earnings audit trail from ledger
- Dual-role users see unified wallet, split activity views

---

## Phase 12 — Admin Portal (Full)

**Goal:** Platform operations and oversight.

### Deliverables
- Withdrawal queue (Phase 4) + bulk actions
- User search, role assignment, suspend
- Fraud review queue (flagged submissions/views)
- Platform stats: GMV, active campaigns, pending payouts
- Manual wallet adjustments with audit log

### Routes
| Route | Access |
|-------|--------|
| `/dashboard/admin` | Admin |
| `/dashboard/admin/withdrawals` | Admin |
| `/dashboard/admin/users` | Admin |
| `/dashboard/admin/fraud` | Admin |
| `/dashboard/admin/stats` | Admin |

### Exit criteria
- Admin-only RLS and middleware guards
- All sensitive actions logged

---

## Phase 13 — Payments & Deposits (Optional v1+)

**Goal:** Brands fund campaigns via payment gateway.

### Deliverables
- PayFast or Stripe integration for brand deposits
- Webhook handlers under `/api/webhooks`
- Ledger entries for deposits and platform fees
- Invoice/receipt records

### Exit criteria
- Brand can deposit; wallet/campaign budget updates atomically
- Webhook idempotency and reconciliation

---

## Phase 14 — Moat

**Goal:** Differentiation and scale.

### Deliverables
- AI-assisted content review (submission guidelines check)
- Fraud detection (view anomalies, duplicate accounts)
- Advanced analytics for brands and creators
- Optional white-label / API for partners

### Exit criteria
- Documented ROI metrics; features gated behind admin config

---

## Cross-Cutting Concerns (all phases)

| Concern | Rule |
|---------|------|
| Money | Ledger + transactions; no balance-only updates |
| Validation | Zod on client and server |
| Auth | Supabase RLS; middleware on `/dashboard` |
| Forms | React Hook Form + `zodResolver` |
| Sensitive data | Encrypt bank details; never log |
| Public pages | Server Components where possible |
| Jobs | Trigger.dev or Inngest; not `setInterval` in browser |

---

## Environment Variables (cumulative)

```env
# Phase 1+
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Phase 7+
TRIGGER_SECRET_KEY=
# or INNGEST_EVENT_KEY= / INNGEST_SIGNING_KEY=

# Phase 7+ (view polling)
# TIKTOK_API_KEY=
# YOUTUBE_API_KEY=

# Phase 13+
# STRIPE_SECRET_KEY= / PAYFAST_*
```

---

## Open Decisions (track in AGENTS.md)

- Platform name / branding
- Niche focus (general vs gaming/crypto/podcasts)
- Brand deposit: manual v1 vs gateway
- Influencer booking: instant vs request/accept
- Auto-approve submissions after 48h
- Minimum withdrawal amount
- Currency / countries (ZAR focus?)

---

## How to Use This Document

1. Complete phases in order unless dependencies allow parallel work (e.g. Phase 9 can start after Phase 1).
2. Check off deliverables in each phase before moving on.
3. Update **Current stage** at the top when a phase completes.
4. Keep AGENTS.md as product/architecture truth; PHASE.md as execution checklist.
