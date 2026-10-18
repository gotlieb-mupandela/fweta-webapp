import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseStore, Profile, Submission, ViewSnapshot } from "@/lib/db/types";
import { allocateCampaignFunds } from "@/lib/campaigns/fund";
import {
  checksSatisfied,
  creatorLevel,
  payoutIdentityReady,
  referralCodeFor,
  weekKey,
  weeklyLeaderboard,
} from "@/lib/marketplace/growth";
import { feeReserveForBudget } from "@/lib/rewards/content-rewards";

const now = Date.parse("2026-10-14T12:00:00.000Z");

function empty(): DatabaseStore {
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

test("required tags must all be confirmed", () => {
  assert.equal(checksSatisfied(["Logo", "Caption"], ["logo", "Caption"]), true);
  assert.equal(checksSatisfied(["Logo"], []), false);
  assert.equal(checksSatisfied([], []), true);
});

test("levels follow verified views", () => {
  assert.equal(creatorLevel(0).name, "Starter");
  assert.equal(creatorLevel(1000).name, "Rising");
  assert.equal(creatorLevel(10000).name, "Established");
  assert.equal(creatorLevel(50000).name, "Lead");
});

test("payout identity needs a verified ID photo", () => {
  assert.equal(payoutIdentityReady(null), false);
  assert.equal(
    payoutIdentityReady({ legalName: "Kai", idNumberEnc: "x", country: "NA", submittedAt: "2026-01-01" }),
    false,
  );
  assert.equal(
    payoutIdentityReady({
      legalName: "Kai",
      idNumberEnc: "x",
      country: "NA",
      submittedAt: "2026-01-01",
      documentPath: "a.png",
      status: "verified",
    }),
    true,
  );
});

test("weekly board uses this week's confirmed checks and fixed prizes", () => {
  const store = empty();
  store.profiles.push({ id: "u1", displayName: "Kai" } as Profile);
  store.submissions.push({
    id: "s1",
    campaignId: "c1",
    clipperId: "u1",
    status: "approved",
  } as Submission);
  store.viewSnapshots.push({
    id: "v1",
    submissionId: "s1",
    views: 4000,
    recordedAt: "2026-10-14T08:00:00.000Z",
    status: "confirmed",
  } as ViewSnapshot);
  const rows = weeklyLeaderboard(store, now);
  assert.equal(weekKey(now), "2026-10-12");
  assert.equal(rows[0]?.prizeCents, 20000);
  assert.equal(rows[0]?.views, 4000);
});

test("a stored fee rate changes the reserve on the next campaign", () => {
  const store = empty();
  store.platformSettings.push({
    id: "default",
    platformFeeBps: 500,
    updatedAt: "2026-10-01",
    updatedBy: null,
  });
  store.wallets.push({ userId: "brand", availableCents: 100000, pendingCents: 0, updatedAt: "2026-10-01" });
  const campaign = {
    id: "c1",
    brandId: "brand",
    budgetTotalCents: 10000,
    feeReservedCents: 0,
    feeBps: undefined,
  } as unknown as Parameters<typeof allocateCampaignFunds>[1];
  store.campaigns.push(campaign);
  allocateCampaignFunds(store, campaign);
  assert.equal(feeReserveForBudget(10000, 500), 500);
  assert.equal(campaign.feeReservedCents, 500);
  assert.equal(store.wallets[0].availableCents, 100000 - 10000 - 500);
});

test("referral codes are stable", () => {
  assert.equal(referralCodeFor("12345678-aaaa-bbbb-cccc-ddddeeeeffff"), "FW12345678");
});
