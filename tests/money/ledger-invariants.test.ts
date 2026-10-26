import assert from "node:assert/strict";
import test from "node:test";

import { allocateCampaignFunds, isCampaignFunded } from "../../lib/campaigns/fund";
import type { Campaign, DatabaseStore, LedgerEntry, Submission } from "../../lib/db/types";
import {
  allocatePoolShares,
  EARNING_WINDOW_MS,
  feeReserveForBudget,
  FRAUD_HOLD_MS,
  hydrateCampaign,
  hydrateSubmission,
  qualifiedViewCount,
} from "../../lib/rewards/content-rewards";
import {
  applyConfirmedViews,
  clawbackSubmission,
  finalizeCampaign,
  forfeitUpheldSubmission,
  refundUnspentCampaign,
  settlePool,
} from "../../lib/rewards/earnings";
import { reviewSubmissionInStore, type ReviewActor } from "../../lib/rewards/review-submission";
import { settleRewardsInStore } from "../../lib/rewards/settle-job";
import {
  commitAdminViewCount,
  SETTLED_CAMPAIGN_ERROR,
  VIEWS_BACKWARDS_ERROR,
  type ViewActor,
} from "../../lib/rewards/view-entry";
import { applyWalletDelta } from "../../lib/wallet/ledger";

const SEED = 20261025;
const DEPOSIT = 5_000_000;
const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();

const BRAND = "11111111-1111-4111-8111-111111111111";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const CLIPPERS = [
  "22222222-2222-4222-8222-222222222221",
  "22222222-2222-4222-8222-222222222222",
  "22222222-2222-4222-8222-222222222223",
] as const;

const REFUSALS = new Set([
  "Admin only.",
  "Clip not found.",
  "Approve the clip before counting views.",
  "This clip was forfeited.",
  "Campaign missing.",
  "Not found.",
  "Not allowed.",
  "Each clip can only be saved once.",
  SETTLED_CAMPAIGN_ERROR,
  VIEWS_BACKWARDS_ERROR,
]);

type ScriptOp =
  | "fund"
  | "submit"
  | "approve"
  | "approve-all"
  | "reject"
  | "flag"
  | "views-up"
  | "views-up-all"
  | "views-down"
  | "fraud-uphold"
  | "fraud-dismiss"
  | "clawback"
  | "pool-settle"
  | "close"
  | "release";

type World = {
  store: DatabaseStore;
  moneyIn: number;
  now: number;
  brand: ReviewActor;
  admin: ViewActor;
  clipperIds: string[];
  campaign: Campaign;
  focusId: string | null;
  next: number;
  clipperCursor: number;
  rand: () => number;
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

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

function nextId(world: { next: number }): string {
  world.next += 1;
  return `40000000-0000-4000-8000-${world.next.toString(16).padStart(12, "0")}`;
}

function walletOf(store: DatabaseStore, userId: string) {
  const wallet = store.wallets.find((row) => row.userId === userId);
  if (!wallet) throw new Error(`Missing wallet ${userId}`);
  return wallet;
}

function snapshotMoney(store: DatabaseStore): string {
  return JSON.stringify({
    wallets: store.wallets
      .map((row) => [row.userId, row.availableCents, row.pendingCents] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
    ledger: store.ledgerEntries.map((entry) => [
      entry.userId,
      entry.type,
      entry.amountCents,
      entry.referenceType,
      entry.referenceId,
      entry.balanceAfterAvailableCents,
      entry.balanceAfterPendingCents,
    ]),
    campaigns: store.campaigns
      .map((camp) => [
        camp.id,
        camp.budgetSpentCents,
        camp.budgetTotalCents,
        camp.feeReservedCents,
        camp.feeChargedCents,
        camp.feeRefundedCents,
        camp.unspentReturnedCents,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    submissions: store.submissions
      .map((sub) => [sub.id, sub.reservedCents, sub.releasedCents, sub.earningsCents] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
  });
}

function creatorCents(store: DatabaseStore, campaignId: string): number {
  return store.submissions
    .filter((sub) => sub.campaignId === campaignId)
    .reduce((sum, sub) => sum + sub.reservedCents + sub.releasedCents, 0);
}

function countCredits(
  store: DatabaseStore,
  referenceType: LedgerEntry["referenceType"],
  referenceId: string,
): number {
  return store.ledgerEntries.filter(
    (entry) => entry.type === "credit" && entry.referenceType === referenceType && entry.referenceId === referenceId,
  ).length;
}

/**
 * Campaign identity: budget + fee set-aside
 * = creator reserves and releases + fee charged + budget returned + fee refunded + still unreturned.
 * Global identity: wallets + leftover campaign cash + kept fees = the deposit.
 * Ledger balance-after rows replay to the same wallet totals.
 */
function assertInvariants(store: DatabaseStore, moneyIn: number, label: string) {
  let walletSum = 0;
  for (const wallet of store.wallets) {
    assert.equal(Number.isInteger(wallet.availableCents), true, `${label} available cents`);
    assert.equal(Number.isInteger(wallet.pendingCents), true, `${label} pending cents`);
    assert.ok(wallet.availableCents >= 0, `${label} negative available`);
    assert.ok(wallet.pendingCents >= 0, `${label} negative pending`);
    walletSum += wallet.availableCents + wallet.pendingCents;
  }

  let lockbox = 0;
  for (const camp of store.campaigns) {
    assert.ok(
      camp.budgetSpentCents <= camp.budgetTotalCents,
      `${label} invariant (a) budgetSpentCents ${camp.budgetSpentCents} exceeds budgetTotalCents ${camp.budgetTotalCents}`,
    );
    const paidOrReserved = creatorCents(store, camp.id);
    for (const sub of store.submissions) {
      if (sub.campaignId !== camp.id) continue;
      assert.equal(sub.earningsCents, sub.reservedCents + sub.releasedCents, `${label} earnings total`);
    }
    if (!isCampaignFunded(store, camp.id)) {
      assert.equal(paidOrReserved, 0, `${label} invariant (c) unfunded campaign paid a creator`);
      assert.equal(camp.budgetSpentCents, 0, `${label} invariant (c) unfunded campaign recorded spend`);
      continue;
    }
    assert.equal(paidOrReserved, camp.budgetSpentCents, `${label} invariant (b) creator balances and budgetSpentCents`);
    const stillBudget = camp.budgetTotalCents - camp.budgetSpentCents - camp.unspentReturnedCents;
    const stillFee = camp.feeReservedCents - camp.feeChargedCents - camp.feeRefundedCents;
    assert.ok(stillBudget >= 0, `${label} invariant (b) unreturned budget is ${stillBudget}`);
    assert.ok(stillFee >= 0, `${label} invariant (b) unreturned fee is ${stillFee}`);
    const funded = camp.budgetTotalCents + camp.feeReservedCents;
    const accounted =
      paidOrReserved + camp.feeChargedCents + camp.unspentReturnedCents + camp.feeRefundedCents + stillBudget + stillFee;
    assert.equal(accounted, funded, `${label} invariant (b) campaign cents do not balance`);
    lockbox += stillBudget + (camp.feeReservedCents - camp.feeRefundedCents);
  }

  const ledgerNet = replayLedger(store, label);
  assert.equal(ledgerNet, walletSum, `${label} invariant (c) ledger totals do not match wallets`);
  assert.equal(
    walletSum + lockbox,
    moneyIn,
    `${label} invariant (c) wallets (${walletSum}) plus lockbox (${lockbox}) do not equal money put in (${moneyIn})`,
  );
}

function replayLedger(store: DatabaseStore, label: string): number {
  const running = new Map<string, { available: number; pending: number }>();
  for (const entry of store.ledgerEntries) {
    const prev = running.get(entry.userId) ?? { available: 0, pending: 0 };
    const deltaAvailable = entry.balanceAfterAvailableCents - prev.available;
    const deltaPending = entry.balanceAfterPendingCents - prev.pending;
    assert.equal(Number.isInteger(entry.amountCents), true, `${label} ledger amount`);
    assert.ok(entry.amountCents >= 0, `${label} ledger amount`);
    if (deltaAvailable !== 0) {
      assert.equal(entry.amountCents, Math.abs(deltaAvailable), `${label} ledger amount and available movement`);
    } else {
      assert.equal(entry.amountCents, Math.abs(deltaPending), `${label} ledger amount and pending movement`);
    }
    const direction = deltaAvailable !== 0 ? deltaAvailable : deltaPending;
    if (direction > 0) assert.equal(entry.type, "credit", `${label} ledger credit`);
    if (direction < 0) assert.equal(entry.type, "debit", `${label} ledger debit`);
    assert.ok(entry.balanceAfterAvailableCents >= 0, `${label} ledger available`);
    assert.ok(entry.balanceAfterPendingCents >= 0, `${label} ledger pending`);
    running.set(entry.userId, {
      available: entry.balanceAfterAvailableCents,
      pending: entry.balanceAfterPendingCents,
    });
  }
  let net = 0;
  for (const [userId, balance] of running) {
    const wallet = walletOf(store, userId);
    assert.equal(wallet.availableCents, balance.available, `${label} wallet available drifted from the ledger`);
    assert.equal(wallet.pendingCents, balance.pending, `${label} wallet pending drifted from the ledger`);
    net += balance.available + balance.pending;
  }
  for (const wallet of store.wallets) {
    if (running.has(wallet.userId)) continue;
    assert.equal(wallet.availableCents, 0, `${label} wallet without a ledger row`);
    assert.equal(wallet.pendingCents, 0, `${label} wallet without a ledger row`);
  }
  return net;
}

function refusalMessage(error: unknown): string {
  if (error instanceof Error && REFUSALS.has(error.message)) return error.message;
  throw error;
}

function makeCampaign(
  world: { store: DatabaseStore; next: number },
  partial: Pick<Campaign, "payModel" | "budgetTotalCents" | "cpmCents"> & Partial<Campaign>,
): Campaign {
  const camp = hydrateCampaign({
    id: nextId(world),
    brandId: BRAND,
    title: partial.payModel === "pool" ? "Pool" : "CPM",
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
    maxPayoutPerSubmissionCents: partial.budgetTotalCents,
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
  world.store.campaigns.push(camp);
  return camp;
}

function makeWorld(
  payModel: "cpm" | "pool",
  budget: number,
  cpm: number,
  rand: () => number = mulberry32(SEED),
): World {
  const store = emptyStore();
  const draft = { store, next: 0 };
  const world: World = {
    store,
    moneyIn: DEPOSIT,
    now: NOW,
    brand: { id: BRAND, roles: ["brand"] },
    admin: { id: ADMIN, email: "admin@fweta.test", roles: ["admin"] },
    clipperIds: [...CLIPPERS],
    campaign: makeCampaign(draft, { payModel, budgetTotalCents: budget, cpmCents: cpm }),
    focusId: null,
    next: draft.next,
    clipperCursor: 0,
    rand,
  };
  for (const userId of [BRAND, ...CLIPPERS]) {
    store.wallets.push({ userId, availableCents: 0, pendingCents: 0, updatedAt: NOW_ISO });
  }
  applyWalletDelta(store, {
    userId: BRAND,
    availableDelta: DEPOSIT,
    type: "credit",
    reason: "Pay-in confirmed",
    referenceType: "brand_deposit",
    referenceId: null,
  });
  return world;
}

function focus(world: World): Submission | undefined {
  return world.store.submissions.find((sub) => sub.id === world.focusId);
}

function fund(world: World, camp: Campaign, label: string) {
  const before = snapshotMoney(world.store);
  const already = isCampaignFunded(world.store, camp.id);
  allocateCampaignFunds(world.store, camp);
  if (already) {
    assert.equal(snapshotMoney(world.store), before, `${label} funding twice debited the brand again`);
    return;
  }
  assert.equal(
    camp.feeReservedCents,
    feeReserveForBudget(camp.budgetTotalCents, camp.feeBps),
    `${label} fee set-aside`,
  );
}

function submit(world: World, camp: Campaign = world.campaign) {
  const clipperId = world.clipperIds[world.clipperCursor % world.clipperIds.length] ?? CLIPPERS[0];
  world.clipperCursor += 1;
  const sub = hydrateSubmission({
    id: nextId(world),
    campaignId: camp.id,
    clipperId,
    postUrl: `https://www.tiktok.com/@kai/video/${world.next}`,
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
    createdAt: new Date(world.now).toISOString(),
    updatedAt: new Date(world.now).toISOString(),
  });
  world.store.submissions.push(sub);
  world.focusId = sub.id;
  return sub;
}

function approveSub(world: World, sub: Submission, label: string) {
  const before = snapshotMoney(world.store);
  try {
    reviewSubmissionInStore(world.store, world.brand, sub.id, { status: "approved" }, world.now);
  } catch (error) {
    assert.equal(refusalMessage(error), "This clip was forfeited.", label);
    assert.equal(snapshotMoney(world.store), before, `${label} refused approve moved money`);
  }
}

function reject(world: World, label: string) {
  const sub = focus(world);
  if (!sub) return;
  const again = sub.status === "rejected";
  const before = snapshotMoney(world.store);
  reviewSubmissionInStore(world.store, world.brand, sub.id, { status: "rejected" }, world.now);
  if (again) assert.equal(snapshotMoney(world.store), before, `${label} rejecting twice moved money`);
}

function flag(world: World, label: string) {
  const sub = focus(world);
  if (!sub) return;
  const before = snapshotMoney(world.store);
  reviewSubmissionInStore(
    world.store,
    world.brand,
    sub.id,
    { status: "flagged", reviewNote: "Check this" },
    world.now,
  );
  assert.equal(snapshotMoney(world.store), before, `${label} flagging moved money`);
}

function viewsUp(world: World, sub: Submission, delta: number, label: string) {
  const before = snapshotMoney(world.store);
  try {
    commitAdminViewCount(
      world.store,
      world.admin,
      { submissionId: sub.id, views: sub.views + delta },
      world.now,
    );
  } catch (error) {
    refusalMessage(error);
    assert.equal(snapshotMoney(world.store), before, `${label} refused view entry moved money`);
  }
}

function viewsDown(world: World, sub: Submission, target: number, label: string) {
  if (target < sub.views) {
    const before = snapshotMoney(world.store);
    let refused = false;
    try {
      commitAdminViewCount(world.store, world.admin, { submissionId: sub.id, views: target }, world.now);
    } catch (error) {
      refused = true;
      refusalMessage(error);
      assert.equal(snapshotMoney(world.store), before, `${label} lower admin view count moved money`);
    }
    assert.equal(refused, true, `${label} admin accepted a lower view count`);
  }
  applyConfirmedViews(world.store, sub.id, target, sub.likes, sub.comments, world.now);
}

function uphold(world: World, label: string) {
  const sub = focus(world);
  if (!sub) return;
  const again = sub.fraudState === "upheld" || sub.payoutState === "clawed_back";
  const before = snapshotMoney(world.store);
  forfeitUpheldSubmission(world.store, sub.id, world.now);
  if (again) assert.equal(snapshotMoney(world.store), before, `${label} upholding fraud twice moved money`);
}

function dismiss(world: World, label: string) {
  const sub = focus(world);
  if (!sub) return;
  const before = snapshotMoney(world.store);
  sub.fraudState = "dismissed";
  sub.updatedAt = new Date(world.now).toISOString();
  for (const flagRow of world.store.fraudFlags) {
    if (flagRow.submissionId !== sub.id || flagRow.status !== "open") continue;
    flagRow.status = "dismissed";
    flagRow.resolvedAt = sub.updatedAt;
  }
  assert.equal(snapshotMoney(world.store), before, `${label} dismissing fraud moved money`);
}

function clawback(world: World, sub: Submission, label: string) {
  const again = sub.payoutState === "clawed_back";
  const before = snapshotMoney(world.store);
  clawbackSubmission(world.store, sub.id, world.now, "Rejected. Earnings returned.");
  if (again) assert.equal(snapshotMoney(world.store), before, `${label} clawback twice moved money`);
}

function settlePoolChecked(world: World, camp: Campaign, label: string) {
  if (camp.payModel !== "pool") return;
  const beforeMoney = snapshotMoney(world.store);
  const clips = world.store.submissions.filter(
    (sub) =>
      sub.campaignId === camp.id &&
      sub.status === "approved" &&
      sub.fraudState !== "upheld" &&
      sub.payoutState !== "clawed_back" &&
      qualifiedViewCount(sub, world.now) >= camp.minViews,
  );
  const shares = allocatePoolShares(
    camp.budgetTotalCents,
    clips.map((sub) => ({ id: sub.id, views: qualifiedViewCount(sub, world.now) })),
    camp.maxPayoutPerSubmissionCents,
  );
  let sum = 0;
  for (const share of shares.values()) {
    assert.ok(share >= 0, label);
    assert.ok(share <= camp.maxPayoutPerSubmissionCents, `${label} share exceeds the per-clip cap`);
    sum += share;
  }
  assert.ok(sum <= camp.budgetTotalCents, `${label} pool shares ${sum} exceed budget ${camp.budgetTotalCents}`);
  const reservedBefore = new Map(clips.map((sub) => [sub.id, sub.reservedCents]));
  const already = Boolean(camp.poolSettledAt);
  const payoutClosed = Boolean(camp.closedAt || camp.settledAt) || !isCampaignFunded(world.store, camp.id);
  settlePool(world.store, camp, world.now);
  if (already || payoutClosed) {
    assert.equal(
      snapshotMoney(world.store),
      beforeMoney,
      already ? `${label} settling twice paid again` : `${label} closed or unfunded pool paid creators`,
    );
    return;
  }
  for (const sub of clips) {
    const paid = sub.reservedCents - (reservedBefore.get(sub.id) ?? 0);
    assert.equal(paid, shares.get(sub.id) ?? 0, `${label} pool share`);
  }
}

function closeChecked(world: World, camp: Campaign, label: string) {
  const brandBefore = walletOf(world.store, camp.brandId).availableCents;
  const returnedBefore = camp.unspentReturnedCents;
  const feeBefore = camp.feeRefundedCents;
  const fundCredits = countCredits(world.store, "campaign_fund", camp.id);
  const feeCredits = countCredits(world.store, "campaign_fee", camp.id);
  const wasClosed = Boolean(camp.closedAt);
  finalizeCampaign(world.store, camp, world.now);
  refundUnspentCampaign(world.store, camp, world.now);
  if (!wasClosed) return;
  assert.equal(
    walletOf(world.store, camp.brandId).availableCents,
    brandBefore,
    `${label} invariant (d) closing twice returned money to the brand`,
  );
  assert.equal(camp.unspentReturnedCents, returnedBefore, `${label} invariant (d) unspent budget returned twice`);
  assert.equal(camp.feeRefundedCents, feeBefore, `${label} invariant (d) fee refunded twice`);
  assert.equal(countCredits(world.store, "campaign_fund", camp.id), fundCredits, `${label} invariant (d) extra fund credit`);
  assert.equal(countCredits(world.store, "campaign_fee", camp.id), feeCredits, `${label} invariant (d) extra fee credit`);
}

function release(world: World) {
  settleRewardsInStore(world.store, world.now + EARNING_WINDOW_MS + FRAUD_HOLD_MS);
}

function creatorTotals(store: DatabaseStore) {
  let pending = 0;
  let available = 0;
  for (const userId of CLIPPERS) {
    const wallet = store.wallets.find((row) => row.userId === userId);
    pending += wallet?.pendingCents ?? 0;
    available += wallet?.availableCents ?? 0;
  }
  return { pending, available };
}

function runScriptOp(world: World, op: ScriptOp, label: string) {
  if (op === "fund") {
    fund(world, world.campaign, label);
    return;
  }
  if (op === "submit") {
    submit(world);
    return;
  }
  if (op === "approve") {
    const sub = focus(world);
    if (sub) approveSub(world, sub, label);
    return;
  }
  if (op === "approve-all") {
    for (const sub of [...world.store.submissions]) {
      if (sub.status === "approved" || sub.fraudState === "upheld" || sub.payoutState === "clawed_back") continue;
      approveSub(world, sub, label);
    }
    return;
  }
  if (op === "reject") {
    reject(world, label);
    return;
  }
  if (op === "flag") {
    flag(world, label);
    return;
  }
  if (op === "views-up") {
    const sub = focus(world);
    if (sub) viewsUp(world, sub, 2_000, label);
    return;
  }
  if (op === "views-up-all") {
    for (const sub of [...world.store.submissions]) {
      if (sub.status !== "approved") continue;
      viewsUp(world, sub, 2_000, label);
    }
    return;
  }
  if (op === "views-down") {
    const sub = focus(world);
    if (sub) viewsDown(world, sub, Math.floor(sub.views / 2), label);
    return;
  }
  if (op === "fraud-uphold") {
    uphold(world, label);
    return;
  }
  if (op === "fraud-dismiss") {
    dismiss(world, label);
    return;
  }
  if (op === "clawback") {
    const sub = focus(world);
    if (sub) clawback(world, sub, label);
    return;
  }
  if (op === "pool-settle") {
    settlePoolChecked(world, world.campaign, label);
    return;
  }
  if (op === "close") {
    closeChecked(world, world.campaign, label);
    return;
  }
  release(world);
}

type Sequence = {
  name: string;
  payModel: "cpm" | "pool";
  budget: number;
  cpm: number;
  steps: ScriptOp[];
  brandAvailable: number;
  creatorPending: number;
  creatorAvailable: number;
  spent: number;
  unspentReturned: number;
};

const sequences: Sequence[] = [
  {
    name: "cpm rejected, flagged, and re-approved",
    payModel: "cpm",
    budget: 100_000,
    cpm: 5_000,
    steps: ["fund", "submit", "reject", "flag", "approve", "views-up", "close", "close"],
    brandAvailable: DEPOSIT - 11_000,
    creatorPending: 10_000,
    creatorAvailable: 0,
    spent: 10_000,
    unspentReturned: 90_000,
  },
  {
    name: "cpm approve, reject, then re-approve",
    payModel: "cpm",
    budget: 100_000,
    cpm: 5_000,
    steps: ["fund", "submit", "approve", "views-up", "reject", "approve", "views-up", "close", "close"],
    brandAvailable: DEPOSIT,
    creatorPending: 0,
    creatorAvailable: 0,
    spent: 0,
    unspentReturned: 100_000,
  },
  {
    name: "cpm views up, engine views down, close twice",
    payModel: "cpm",
    budget: 100_000,
    cpm: 5_000,
    steps: ["fund", "submit", "approve", "views-up", "views-down", "close", "close"],
    brandAvailable: DEPOSIT - 5_500,
    creatorPending: 5_000,
    creatorAvailable: 0,
    spent: 5_000,
    unspentReturned: 95_000,
  },
  {
    name: "cpm fraud upheld twice then closed",
    payModel: "cpm",
    budget: 100_000,
    cpm: 5_000,
    steps: ["fund", "submit", "approve", "views-up", "fraud-uphold", "fraud-uphold", "close", "close"],
    brandAvailable: DEPOSIT,
    creatorPending: 0,
    creatorAvailable: 0,
    spent: 0,
    unspentReturned: 100_000,
  },
  {
    name: "cpm fraud dismissed still pays later views",
    payModel: "cpm",
    budget: 100_000,
    cpm: 5_000,
    steps: ["fund", "submit", "approve", "views-up", "fraud-dismiss", "views-up", "close", "close"],
    brandAvailable: DEPOSIT - 22_000,
    creatorPending: 20_000,
    creatorAvailable: 0,
    spent: 20_000,
    unspentReturned: 80_000,
  },
  {
    name: "cpm hold release then close twice",
    payModel: "cpm",
    budget: 100_000,
    cpm: 5_000,
    steps: ["fund", "submit", "approve", "views-up", "release", "close", "close"],
    brandAvailable: DEPOSIT - 11_000,
    creatorPending: 0,
    creatorAvailable: 10_000,
    spent: 10_000,
    unspentReturned: 90_000,
  },
  {
    name: "cpm budget spent in one view entry",
    payModel: "cpm",
    budget: 10_000,
    cpm: 5_000,
    steps: ["fund", "submit", "approve", "views-up", "close", "close"],
    brandAvailable: DEPOSIT - 11_000,
    creatorPending: 10_000,
    creatorAvailable: 0,
    spent: 10_000,
    unspentReturned: 0,
  },
  {
    name: "pool equal split settles once and closes twice",
    payModel: "pool",
    budget: 10_000,
    cpm: 0,
    steps: ["fund", "submit", "submit", "approve-all", "views-up-all", "pool-settle", "pool-settle", "close", "close"],
    brandAvailable: DEPOSIT - 11_000,
    creatorPending: 10_000,
    creatorAvailable: 0,
    spent: 10_000,
    unspentReturned: 0,
  },
  {
    name: "pool remainder cent is returned once",
    payModel: "pool",
    budget: 100,
    cpm: 0,
    steps: [
      "fund",
      "submit",
      "submit",
      "submit",
      "approve-all",
      "views-up-all",
      "pool-settle",
      "pool-settle",
      "close",
      "close",
    ],
    brandAvailable: DEPOSIT - 108,
    creatorPending: 99,
    creatorAvailable: 0,
    spent: 99,
    unspentReturned: 1,
  },
];

test("scripted cpm and pool sequences keep every cent", () => {
  for (const sequence of sequences) {
    const world = makeWorld(sequence.payModel, sequence.budget, sequence.cpm);
    sequence.steps.forEach((op, index) => {
      const label = `${sequence.name} step ${index + 1} ${op}`;
      runScriptOp(world, op, label);
      assertInvariants(world.store, world.moneyIn, label);
    });
    const creators = creatorTotals(world.store);
    assert.equal(walletOf(world.store, BRAND).availableCents, sequence.brandAvailable, sequence.name);
    assert.equal(creators.pending, sequence.creatorPending, sequence.name);
    assert.equal(creators.available, sequence.creatorAvailable, sequence.name);
    assert.equal(world.campaign.budgetSpentCents, sequence.spent, sequence.name);
    assert.equal(world.campaign.unspentReturnedCents, sequence.unspentReturned, sequence.name);
    assert.ok(world.campaign.closedAt, sequence.name);
  }
});

test("pool shares never exceed the budget", () => {
  const cases: { budget: number; cap: number; clips: { id: string; views: number }[]; sum: number }[] = [
    { budget: 10_000, cap: 100_000, clips: [{ id: "a", views: 1_000 }, { id: "b", views: 3_000 }], sum: 10_000 },
    { budget: 100, cap: 1_000, clips: [{ id: "a", views: 1 }, { id: "b", views: 1 }, { id: "c", views: 1 }], sum: 99 },
    { budget: 10_000, cap: 100, clips: [{ id: "a", views: 50 }, { id: "b", views: 50 }], sum: 200 },
    { budget: 0, cap: 100, clips: [{ id: "a", views: 10 }], sum: 0 },
    { budget: 5_000, cap: 5_000, clips: [{ id: "a", views: 0 }, { id: "b", views: 0 }], sum: 0 },
  ];
  for (const row of cases) {
    const shares = allocatePoolShares(row.budget, row.clips, row.cap);
    let sum = 0;
    for (const share of shares.values()) {
      assert.ok(share >= 0);
      assert.ok(share <= row.cap);
      sum += share;
    }
    assert.equal(sum, row.sum);
    assert.ok(sum <= Math.max(0, row.budget));
  }
  assert.equal(allocatePoolShares(12_345, [{ id: "a", views: 9 }], 99_999).get("a"), 12_345);
  assert.equal(allocatePoolShares(12_345, [{ id: "a", views: 9 }], 100).get("a"), 100);

  const rand = mulberry32(SEED);
  for (let i = 0; i < 200; i += 1) {
    const budget = int(rand, 0, 500_000);
    const count = int(rand, 1, 12);
    const clips = Array.from({ length: count }, (_, index) => ({
      id: `clip-${i}-${index}`,
      views: int(rand, 0, 100_000),
    }));
    const cap = int(rand, 0, budget);
    const shares = allocatePoolShares(budget, clips, cap);
    let sum = 0;
    for (const [id, share] of shares) {
      const clip = clips.find((item) => item.id === id);
      assert.ok(clip);
      assert.ok(clip.views > 0);
      assert.ok(share >= 0);
      assert.ok(share <= cap);
      sum += share;
    }
    assert.ok(sum <= budget, `seed ${SEED} draw ${i} shares ${sum} budget ${budget}`);
  }
});

test("seeded random cpm and pool sequences keep the ledger in balance", () => {
  const rand = mulberry32(SEED);
  const world = makeWorld("cpm", int(rand, 20_000, 80_000), int(rand, 500, 5_000), rand);
  const pool = makeCampaign(world, {
    payModel: "pool",
    budgetTotalCents: int(rand, 20_000, 80_000),
    cpmCents: 0,
    endDate: new Date(NOW + 20 * 86_400_000).toISOString(),
  });
  world.campaign.endDate = new Date(NOW + 12 * 86_400_000).toISOString();
  const ops: ScriptOp[] = [
    "fund",
    "submit",
    "approve",
    "reject",
    "flag",
    "views-up",
    "views-down",
    "fraud-uphold",
    "fraud-dismiss",
    "clawback",
    "pool-settle",
    "close",
    "release",
  ];
  const history: string[] = [];
  fund(world, world.campaign, "seed fund cpm");
  fund(world, pool, "seed fund pool");
  history.push("fund", "fund");
  assertInvariants(world.store, world.moneyIn, `seed ${SEED} after fund`);

  for (let step = 1; step <= 80; step += 1) {
    world.now += int(rand, 0, 36) * 3_600_000;
    const op = ops[int(rand, 0, ops.length - 1)] ?? "release";
    history.push(op);
    const label = `seed ${SEED} step ${step} ${op} (${history.slice(-8).join(" ")})`;
    const camp = world.store.campaigns[int(rand, 0, world.store.campaigns.length - 1)] ?? world.campaign;
    if (op === "fund") fund(world, camp, label);
    else if (op === "submit") {
      if (world.store.submissions.length < 8) submit(world, camp);
    } else if (op === "approve") {
      const sub = pickSubmission(world, false);
      if (sub) approveSub(world, sub, label);
    } else if (op === "reject") {
      const sub = pickSubmission(world, false);
      if (sub) {
        world.focusId = sub.id;
        reject(world, label);
      }
    } else if (op === "flag") {
      const sub = pickSubmission(world, false);
      if (sub) {
        world.focusId = sub.id;
        flag(world, label);
      }
    } else if (op === "views-up") {
      const sub = pickSubmission(world, true);
      if (sub) viewsUp(world, sub, int(rand, 1, 4_000), label);
    } else if (op === "views-down") {
      const sub = pickSubmission(world, true);
      if (sub) {
        const target = sub.views === 0 ? 0 : sub.views - int(rand, 1, sub.views);
        viewsDown(world, sub, target, label);
      }
    } else if (op === "fraud-uphold") {
      const sub = pickSubmission(world, false);
      if (sub) {
        world.focusId = sub.id;
        uphold(world, label);
      }
    } else if (op === "fraud-dismiss") {
      const sub = pickSubmission(world, false);
      if (sub) {
        world.focusId = sub.id;
        dismiss(world, label);
      }
    } else if (op === "clawback") {
      const sub = pickSubmission(world, false);
      if (sub) clawback(world, sub, label);
    } else if (op === "pool-settle") settlePoolChecked(world, camp, label);
    else if (op === "close") closeChecked(world, camp, label);
    else release(world);
    assertInvariants(world.store, world.moneyIn, label);
  }

  for (const camp of world.store.campaigns) {
    closeChecked(world, camp, `seed ${SEED} final close ${camp.payModel}`);
    assertInvariants(world.store, world.moneyIn, `seed ${SEED} final close ${camp.payModel}`);
    closeChecked(world, camp, `seed ${SEED} final close again ${camp.payModel}`);
    assertInvariants(world.store, world.moneyIn, `seed ${SEED} final close again ${camp.payModel}`);
  }
});

function pickSubmission(world: World, biasApproved: boolean): Submission | undefined {
  const all = world.store.submissions;
  if (all.length === 0) return undefined;
  if (biasApproved && world.rand() < 0.75) {
    const open = all.filter(
      (sub) => sub.status === "approved" && sub.payoutState !== "clawed_back" && sub.fraudState !== "upheld",
    );
    if (open.length > 0) return open[int(world.rand, 0, open.length - 1)];
  }
  return all[int(world.rand, 0, all.length - 1)];
}

// A view save must not credit the clipper when the brand was never debited.
test("an unfunded cpm campaign does not pay creators", () => {
  const world = makeWorld("cpm", 100_000, 5_000);
  submit(world);
  const clip = focus(world);
  if (!clip) throw new Error("missing clip");
  approveSub(world, clip, "unfunded approve");
  viewsUp(world, clip, 2_000, "unfunded views");
  assertInvariants(world.store, world.moneyIn, "unfunded cpm views");
});

// settlePool must not credit shares without a campaign_fund debit.
test("an unfunded pool does not pay creators when it settles", () => {
  const world = makeWorld("pool", 10_000, 0);
  submit(world);
  const clip = focus(world);
  if (!clip) throw new Error("missing clip");
  approveSub(world, clip, "unfunded pool approve");
  viewsUp(world, clip, 2_000, "unfunded pool views");
  settlePoolChecked(world, world.campaign, "unfunded pool settle");
  assertInvariants(world.store, world.moneyIn, "unfunded pool settle");
});

// An open pool is refunded on close. A later settlePool must not pay that pot again.
test("settling a closed pool does not mint a second copy of the budget", () => {
  const world = makeWorld("pool", 10_000, 0);
  const steps: ScriptOp[] = ["fund", "submit", "approve", "views-up", "close", "pool-settle"];
  steps.forEach((op, index) => {
    const label = `close then pool settle step ${index + 1} ${op}`;
    runScriptOp(world, op, label);
    assertInvariants(world.store, world.moneyIn, label);
  });
});

test("finalizeCampaign on a closed campaign pays nothing and changes no wallet", () => {
  const world = makeWorld("pool", 10_000, 0);
  const steps: ScriptOp[] = ["fund", "submit", "approve", "views-up", "close"];
  steps.forEach((op, index) => {
    const label = `closed finalize setup ${index + 1} ${op}`;
    runScriptOp(world, op, label);
    assertInvariants(world.store, world.moneyIn, label);
  });
  assert.ok(world.campaign.closedAt);
  assert.equal(world.campaign.poolSettledAt, null);
  const before = snapshotMoney(world.store);
  const walletsBefore = world.store.wallets.map((row) => ({
    userId: row.userId,
    availableCents: row.availableCents,
    pendingCents: row.pendingCents,
  }));
  finalizeCampaign(world.store, world.campaign, world.now);
  assert.equal(snapshotMoney(world.store), before);
  assert.deepEqual(
    world.store.wallets.map((row) => ({
      userId: row.userId,
      availableCents: row.availableCents,
      pendingCents: row.pendingCents,
    })),
    walletsBefore,
  );
  assert.equal(world.campaign.budgetSpentCents, 0);
  assert.equal(world.campaign.feeChargedCents, 0);
  assert.equal(world.campaign.unspentReturnedCents, 10_000);
  assert.equal(creatorTotals(world.store).pending, 0);
  assert.equal(creatorTotals(world.store).available, 0);
  assertInvariants(world.store, world.moneyIn, "finalize closed pool");
});
