import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAMPAIGN_CLOSED_STATUS_ERROR,
  CAMPAIGN_MONEY_LOCK_ERROR,
  CAMPAIGN_STATUS_EDIT_ERROR,
  setCampaignStatusInStore,
  updateCampaignInStore,
} from "../../lib/campaigns/campaign-update";
import { allocateCampaignFunds } from "../../lib/campaigns/fund";
import type { Campaign, DatabaseStore, Submission } from "../../lib/db/types";
import { hydrateCampaign, hydrateSubmission } from "../../lib/rewards/content-rewards";
import { applyConfirmedViews, refundUnspentCampaign, settlePool } from "../../lib/rewards/earnings";
import { reviewSubmissionInStore } from "../../lib/rewards/review-submission";
import { settleRewardsInStore } from "../../lib/rewards/settle-job";
import { applyWalletDelta } from "../../lib/wallet/ledger";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const BRAND = "11111111-1111-4111-8111-111111111111";
const CLIPPER = "22222222-2222-4222-8222-222222222222";
const actor = { id: BRAND, roles: ["brand"] as const };

function emptyStore(): DatabaseStore {
  return {
    profiles: [],
    campaigns: [],
    submissions: [],
    viewSnapshots: [],
    wallets: [],
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

function campaign(partial: Partial<Campaign> & Pick<Campaign, "id" | "payModel" | "budgetTotalCents" | "cpmCents" | "status">): Campaign {
  return hydrateCampaign({
    brandId: BRAND,
    title: "Launch",
    description: "Cut the episode into clips for the campaign.",
    type: "clipping",
    category: "podcast",
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
    maxPayoutPerSubmissionCents: 200_000,
    platforms: ["tiktok"],
    requirements: "Hook",
    rules: "",
    assets: [],
    startDate: null,
    endDate: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    ...partial,
  });
}

function submission(store: DatabaseStore, campaignId: string): Submission {
  const sub = hydrateSubmission({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    campaignId,
    clipperId: CLIPPER,
    postUrl: "https://www.tiktok.com/@kai/video/1",
    platform: "tiktok",
    status: "pending",
    reviewNote: null,
    views: 0,
    baselineViews: null,
    payableViews: 0,
    reservedCents: 0,
    releasedCents: 0,
    earningsCents: 0,
    approvedAt: null,
    earningUntil: null,
    holdUntil: null,
    releasedAt: null,
    payoutState: "none",
    nextPollAt: null,
    lastPolledAt: null,
    postLive: null,
    likes: null,
    comments: null,
    fraudScore: 0,
    fraudState: "clear",
    fraudReasons: [],
    appealUsed: false,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });
  store.submissions.push(sub);
  return sub;
}

function world(partial: Parameters<typeof campaign>[0], deposit = 1_000_000) {
  const store = emptyStore();
  const row = campaign(partial);
  store.campaigns.push(row);
  store.wallets.push(
    { userId: BRAND, availableCents: 0, pendingCents: 0, updatedAt: NOW_ISO },
    { userId: CLIPPER, availableCents: 0, pendingCents: 0, updatedAt: NOW_ISO },
  );
  applyWalletDelta(store, {
    userId: BRAND,
    availableDelta: deposit,
    type: "credit",
    reason: "Pay-in confirmed",
    referenceType: "brand_deposit",
    referenceId: null,
  });
  return { store, row };
}

function fundDebits(store: DatabaseStore, campaignId: string) {
  return store.ledgerEntries
    .filter((entry) => entry.type === "debit" && entry.referenceType === "campaign_fund" && entry.referenceId === campaignId)
    .reduce((sum, entry) => sum + entry.amountCents, 0);
}

function fundCredits(store: DatabaseStore, campaignId: string) {
  return store.ledgerEntries
    .filter((entry) => entry.type === "credit" && entry.referenceType === "campaign_fund" && entry.referenceId === campaignId)
    .reduce((sum, entry) => sum + entry.amountCents, 0);
}

function creatorPending(store: DatabaseStore) {
  return store.wallets.find((row) => row.userId === CLIPPER)?.pendingCents ?? 0;
}

function brandAvailable(store: DatabaseStore) {
  return store.wallets.find((row) => row.userId === BRAND)?.availableCents ?? 0;
}

function refuse(run: () => void): string {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof Error);
    return error.message;
  }
  assert.fail("expected a refusal");
}

test("updateCampaignAction refuses to publish a draft and does not pay a creator", () => {
  const source = readFileSync(new URL("../../app/actions/campaigns.ts", import.meta.url), "utf8");
  assert.match(source, /updateCampaignInStore/);
  assert.equal(source.includes("Object.assign"), false);

  const { store, row } = world({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    payModel: "cpm",
    budgetTotalCents: 10_000,
    cpmCents: 5_000,
    status: "draft",
  });
  updateCampaignInStore(store, actor, row.id, { title: "Launch week", budgetTotalCents: 12_000 });
  assert.equal(row.title, "Launch week");
  assert.equal(row.budgetTotalCents, 12_000);
  assert.equal(row.status, "draft");

  const before = brandAvailable(store);
  const message = refuse(() =>
    updateCampaignInStore(store, actor, row.id, { status: "active", title: "Now live" }),
  );
  assert.equal(message, CAMPAIGN_STATUS_EDIT_ERROR);
  assert.equal(row.status, "draft");
  assert.equal(row.title, "Launch week");
  assert.equal(brandAvailable(store), before);
  assert.equal(fundDebits(store, row.id), 0);

  const clip = submission(store, row.id);
  reviewSubmissionInStore(store, actor, clip.id, { status: "approved" }, NOW);
  applyConfirmedViews(store, clip.id, 4_000, null, null, NOW);
  settleRewardsInStore(store, NOW);
  assert.equal(creatorPending(store), 0);
  assert.equal(row.budgetSpentCents, 0);
  assert.equal(
    store.ledgerEntries.some((entry) => entry.referenceType === "campaign_reserve"),
    false,
  );
});

test("updateCampaignAction refuses to complete an unfunded pool and nothing is paid", () => {
  const { store, row } = world({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
    payModel: "pool",
    budgetTotalCents: 10_000,
    cpmCents: 0,
    status: "active",
    endDate: "2026-12-31",
  });
  const clip = submission(store, row.id);
  reviewSubmissionInStore(store, actor, clip.id, { status: "approved" }, NOW);
  applyConfirmedViews(store, clip.id, 4_000, null, null, NOW);

  const before = JSON.stringify(store.wallets);
  const message = refuse(() => updateCampaignInStore(store, actor, row.id, { status: "completed" }));
  assert.equal(message, CAMPAIGN_STATUS_EDIT_ERROR);
  assert.equal(row.status, "active");
  assert.equal(row.closedAt, null);
  settlePool(store, row, NOW);
  settleRewardsInStore(store, NOW);
  assert.equal(creatorPending(store), 0);
  assert.equal(row.budgetSpentCents, 0);
  assert.equal(row.poolSettledAt, null);
  assert.equal(JSON.stringify(store.wallets), before);
});

test("updateCampaignAction refuses a raised budget and close refunds only funded cash", () => {
  const funded = 10_000;
  const { store, row } = world({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac",
    payModel: "cpm",
    budgetTotalCents: funded,
    cpmCents: 5_000,
    status: "draft",
  });
  allocateCampaignFunds(store, row);
  assert.equal(fundDebits(store, row.id), funded);
  const walletAfterFund = brandAvailable(store);

  const message = refuse(() => updateCampaignInStore(store, actor, row.id, { budgetTotalCents: 80_000 }));
  assert.equal(message, CAMPAIGN_MONEY_LOCK_ERROR);
  assert.equal(row.budgetTotalCents, funded);
  assert.equal(brandAvailable(store), walletAfterFund);
  assert.equal(fundDebits(store, row.id), funded);

  setCampaignStatusInStore(store, actor, row.id, "active");
  assert.equal(row.status, "active");
  assert.equal(fundDebits(store, row.id), funded);

  row.budgetTotalCents = 80_000;
  const clip = submission(store, row.id);
  reviewSubmissionInStore(store, actor, clip.id, { status: "approved" }, NOW);
  applyConfirmedViews(store, clip.id, 4_000, null, null, NOW);
  assert.equal(creatorPending(store), funded);
  assert.equal(row.budgetSpentCents, funded);

  refundUnspentCampaign(store, row, NOW);
  assert.equal(row.unspentReturnedCents, 0);
  assert.notEqual(row.unspentReturnedCents, row.budgetTotalCents - row.budgetSpentCents);
  assert.equal(fundCredits(store, row.id), 0);
  assert.ok(fundCredits(store, row.id) <= fundDebits(store, row.id));
  assert.equal(creatorPending(store) + fundCredits(store, row.id) <= fundDebits(store, row.id), true);
});

test("setCampaignStatusAction refuses to reopen a closed pool and the pot is not paid again", () => {
  const source = readFileSync(new URL("../../app/actions/campaigns.ts", import.meta.url), "utf8");
  assert.match(source, /setCampaignStatusInStore/);

  const { store, row } = world({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad",
    payModel: "pool",
    budgetTotalCents: 10_000,
    cpmCents: 0,
    status: "active",
  });
  allocateCampaignFunds(store, row);
  const clip = submission(store, row.id);
  reviewSubmissionInStore(store, actor, clip.id, { status: "approved" }, NOW);
  applyConfirmedViews(store, clip.id, 4_000, null, null, NOW);
  refundUnspentCampaign(store, row, NOW);
  assert.ok(row.closedAt);
  assert.equal(row.poolSettledAt, null);
  assert.equal(creatorPending(store), 0);
  assert.equal(row.unspentReturnedCents, 10_000);

  const wallets = JSON.stringify(store.wallets);
  const ledger = store.ledgerEntries.length;
  assert.equal(
    refuse(() => setCampaignStatusInStore(store, actor, row.id, "active")),
    CAMPAIGN_CLOSED_STATUS_ERROR,
  );
  assert.equal(
    refuse(() => updateCampaignInStore(store, actor, row.id, { payModel: "pool", endDate: "2026-12-31" })),
    CAMPAIGN_MONEY_LOCK_ERROR,
  );
  assert.equal(row.endDate, null);
  assert.equal(
    refuse(() => setCampaignStatusInStore(store, actor, row.id, "completed")),
    CAMPAIGN_CLOSED_STATUS_ERROR,
  );
  settlePool(store, row, NOW);
  settleRewardsInStore(store, NOW);
  assert.equal(creatorPending(store), 0);
  assert.equal(row.budgetSpentCents, 0);
  assert.equal(row.poolSettledAt, null);
  assert.equal(JSON.stringify(store.wallets), wallets);
  assert.equal(store.ledgerEntries.length, ledger);
});

test("closing a funded campaign returns the unspent budget and the unused fee", () => {
  const budget = 100_000;
  const { store, row } = world(
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae",
      payModel: "cpm",
      budgetTotalCents: budget,
      cpmCents: 5_000,
      status: "active",
    },
    5_000_000,
  );
  const brandBefore = brandAvailable(store);
  allocateCampaignFunds(store, row);
  assert.equal(row.feeReservedCents, 10_000);
  assert.equal(brandAvailable(store), brandBefore - budget - 10_000);

  const clip = submission(store, row.id);
  reviewSubmissionInStore(store, actor, clip.id, { status: "approved" }, NOW);
  applyConfirmedViews(store, clip.id, 2_000, null, null, NOW);
  assert.equal(creatorPending(store), 10_000);
  assert.equal(row.budgetSpentCents, 10_000);
  assert.equal(row.feeChargedCents, 1_000);

  setCampaignStatusInStore(store, actor, row.id, "completed");
  settleRewardsInStore(store, NOW);

  assert.equal(row.unspentReturnedCents, 90_000);
  assert.equal(row.feeRefundedCents, 9_000);
  assert.equal(fundCredits(store, row.id), 90_000);
  assert.equal(brandAvailable(store), brandBefore - 10_000 - 1_000);
  assert.equal(creatorPending(store), 10_000);
});
