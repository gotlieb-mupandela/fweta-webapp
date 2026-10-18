import assert from "node:assert/strict";
import test from "node:test";

import { allocateCampaignFunds } from "../../lib/campaigns/fund";
import { hydrateCampaign, hydrateSubmission } from "../../lib/rewards/content-rewards";
import { applyConfirmedViews, clawbackSubmission, finalizeCampaign } from "../../lib/rewards/earnings";
import { applyWalletDelta } from "../../lib/wallet/ledger";
import type { Campaign, DatabaseStore, Submission } from "../../lib/db/types";

const brand = "11111111-1111-4111-8111-111111111111";
const clipper = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-17T12:00:00.000Z");

function wallet(userId: string, availableCents: number, pendingCents = 0) {
  return { userId, availableCents, pendingCents, updatedAt: new Date(now).toISOString() };
}

function campaign(partial: Partial<Campaign> & Pick<Campaign, "id" | "payModel" | "budgetTotalCents" | "cpmCents">): Campaign {
  return hydrateCampaign({
    brandId: brand,
    title: "QA",
    description: "Cut",
    type: "clipping",
    category: "podcast",
    status: "active",
    budgetSpentCents: 0,
    minPayoutCents: 0,
    minViews: 0,
    countries: ["NA"],
    feeReservedCents: 0,
    feeChargedCents: 0,
    feeRefundedCents: 0,
    unspentReturnedCents: 0,
    poolSettledAt: null,
    closedAt: null,
    maxPayoutPerSubmissionCents: 50_000,
    platforms: ["tiktok"],
    requirements: "Hook",
    rules: "",
    assets: [],
    startDate: null,
    endDate: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...partial,
  });
}

function submission(partial: Partial<Submission> & Pick<Submission, "id" | "campaignId">): Submission {
  return hydrateSubmission({
    clipperId: clipper,
    postUrl: "https://www.tiktok.com/@kai/video/1",
    platform: "tiktok",
    status: "approved",
    reviewNote: null,
    views: 0,
    baselineViews: 0,
    payableViews: 0,
    reservedCents: 0,
    releasedCents: 0,
    earningsCents: 0,
    approvedAt: new Date(now).toISOString(),
    earningUntil: new Date(now + 7 * 86400000).toISOString(),
    holdUntil: null,
    releasedAt: null,
    payoutState: "none",
    nextPollAt: null,
    lastPolledAt: null,
    postLive: true,
    likes: null,
    comments: null,
    fraudScore: 0,
    fraudState: "clear",
    fraudReasons: [],
    appealUsed: false,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...partial,
  });
}

function store(campaigns: Campaign[], submissions: Submission[], available = 200_000): DatabaseStore {
  return {
    profiles: [],
    campaigns,
    submissions,
    viewSnapshots: [],
    wallets: [wallet(brand, available), wallet(clipper, 0)],
    ledgerEntries: [],
    payoutMethods: [],
    withdrawalRequests: [],
    influencerProfiles: [],
    rateCards: [],
    bookings: [],
    brandDeposits: [],
    fraudFlags: [],
    notifications: [],
    notificationDispatches: [],
    linkedAccounts: [],
    socialAccounts: [],
    workspaces: [],
    workspaceMembers: [],
    savedCampaigns: [],
    supportTickets: [],
    supportMessages: [],
    auditLog: [],
    prizeAwards: [],
    platformSettings: [],
    ugcBriefs: [],
    ugcApplications: [],
    ugcDeliveries: [],
    contentLicenses: [],
    licenseDisputes: [],
    creatorPortfolios: [],
    businessListings: [],
    creatorReviews: [],
  };
}

test("CPM views reserve creator earnings and stop when the budget is spent", () => {
  const camp = campaign({
    id: "33333333-3333-4333-8333-333333333333",
    payModel: "cpm",
    budgetTotalCents: 10_000,
    cpmCents: 5_000,
    maxPayoutPerSubmissionCents: 10_000,
  });
  const sub = submission({ id: "44444444-4444-4444-8444-444444444444", campaignId: camp.id });
  const db = store([camp], [sub]);
  allocateCampaignFunds(db, camp);
  assert.equal(db.wallets[0].availableCents, 200_000 - 10_000 - 1_000);

  applyConfirmedViews(db, sub.id, 2_000, null, null, now);
  const clipperWallet = db.wallets.find((row) => row.userId === clipper)!;
  assert.ok(clipperWallet.pendingCents > 0 || clipperWallet.availableCents > 0);
  assert.equal(camp.budgetSpentCents, 10_000);
  assert.equal(camp.status, "completed");
  assert.ok(camp.closedAt);
  const brandWallet = db.wallets.find((row) => row.userId === brand)!;
  assert.equal(brandWallet.availableCents, 200_000 - 11_000);
  assert.equal(camp.feeChargedCents, 1_000);
});

test("a rejection returns reserved earnings and unused budget to the brand", () => {
  const camp = campaign({
    id: "55555555-5555-4555-8555-555555555555",
    payModel: "cpm",
    budgetTotalCents: 50_000,
    cpmCents: 5_000,
  });
  const sub = submission({ id: "66666666-6666-4666-8666-666666666666", campaignId: camp.id });
  const db = store([camp], [sub]);
  allocateCampaignFunds(db, camp);
  applyConfirmedViews(db, sub.id, 1_000, null, null, now);
  const reserved = sub.reservedCents + sub.releasedCents;
  assert.ok(reserved > 0);
  const before = db.wallets.find((row) => row.userId === brand)!.availableCents;
  clawbackSubmission(db, sub.id, now, "Rejected. Earnings returned.");
  finalizeCampaign(db, camp, now);
  const after = db.wallets.find((row) => row.userId === brand)!.availableCents;
  assert.ok(after > before);
  assert.equal(sub.payoutState, "clawed_back");
  assert.equal(db.wallets.find((row) => row.userId === clipper)!.pendingCents, 0);
});

test("a pool splits the reserved budget at close", () => {
  const camp = campaign({
    id: "77777777-7777-4777-8777-777777777777",
    payModel: "pool",
    budgetTotalCents: 10_000,
    cpmCents: 0,
    endDate: new Date(now - 1000).toISOString(),
  });
  const sub = submission({ id: "88888888-8888-4888-8888-888888888888", campaignId: camp.id, views: 1_000 });
  const db = store([camp], [sub]);
  allocateCampaignFunds(db, camp);
  applyConfirmedViews(db, sub.id, 1_000, null, null, now);
  finalizeCampaign(db, camp, now);
  const clipperWallet = db.wallets.find((row) => row.userId === clipper)!;
  assert.ok(clipperWallet.pendingCents + clipperWallet.availableCents > 0);
  assert.ok(camp.poolSettledAt || camp.closedAt);
});

test("ledger rows stay paired with wallet changes", () => {
  const camp = campaign({
    id: "99999999-9999-4999-8999-999999999999",
    payModel: "cpm",
    budgetTotalCents: 5_000,
    cpmCents: 1_000,
  });
  const db = store([camp], []);
  applyWalletDelta(db, {
    userId: brand,
    availableDelta: 1_000,
    type: "credit",
    reason: "Pay-in confirmed",
    referenceType: "brand_deposit",
    referenceId: camp.id,
  });
  assert.equal(db.ledgerEntries.length, 1);
  assert.equal(db.wallets[0].availableCents, 201_000);
  assert.equal(db.ledgerEntries[0].balanceAfterAvailableCents, 201_000);
});
