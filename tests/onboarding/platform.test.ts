import assert from "node:assert/strict";
import test from "node:test";

import type { Campaign, DatabaseStore, Profile, SocialAccount, Submission, ViewSnapshot } from "@/lib/db/types";
import { campaignsVisibleToBrand, canEditCampaign } from "@/lib/onboarding/access";
import {
  assertCanAddAccount,
  bioCodeForAccount,
  bioHintLabel,
  generateBioCode,
  reviewDecisionError,
  verifiedAccountsForPlatform,
  statsByAccount,
  withDefault,
} from "@/lib/onboarding/accounts";
import { collectHelpCopy } from "@/lib/onboarding/help";
import {
  collectJourneyCopy,
  journeyFactsFromStore,
  momentIsDone,
  openJourneyMoment,
  JOURNEY_MOMENTS,
} from "@/lib/onboarding/journey";
import { canInviteRole, ensureOwnedWorkspace } from "@/lib/onboarding/workspaces";

function profile(partial: Partial<Profile> & Pick<Profile, "id" | "email" | "roles" | "primaryRole">): Profile {
  return {
    passwordHash: "hash",
    displayName: partial.displayName ?? "User",
    bio: "",
    avatarUrl: null,
    notifyEmail: true,
    notifyWithdrawals: true,
    notifyBookings: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    suspended: false,
    ...partial,
  };
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

function campaign(partial: Partial<Campaign> & Pick<Campaign, "id" | "brandId">): Campaign {
  return {
    title: "Launch",
    description: "Brief",
    type: "clipping",
    category: "Food",
    status: "draft",
    budgetTotalCents: 100000,
    budgetSpentCents: 0,
    cpmCents: 2000,
    minPayoutCents: 0,
    minViews: 0,
    payModel: "cpm",
    countries: ["NA"],
    feeReservedCents: 0,
    feeChargedCents: 0,
    feeRefundedCents: 0,
    unspentReturnedCents: 0,
    poolSettledAt: null,
    closedAt: null,
    maxPayoutPerSubmissionCents: 5000,
    platforms: ["tiktok"],
    requirements: "",
    rules: "",
    assets: [],
    startDate: null,
    endDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function submission(partial: Partial<Submission> & Pick<Submission, "id" | "campaignId" | "clipperId">): Submission {
  return {
    postUrl: "https://www.tiktok.com/@one/video/1",
    platform: "tiktok",
    status: "approved",
    reviewNote: null,
    views: 0,
    baselineViews: 0,
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
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...partial,
  };
}

function account(partial: Partial<SocialAccount> & Pick<SocialAccount, "id" | "platform" | "handle">): SocialAccount {
  return {
    userId: "user-1",
    code: "FWETA-TEST01",
    status: "pending",
    isDefault: false,
    verifiedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("each social account keeps its own stable bio code", () => {
  const first = bioCodeForAccount("user-1", "11111111-1111-4111-8111-111111111111");
  const second = bioCodeForAccount("user-1", "22222222-2222-4222-8222-222222222222");
  assert.match(first, /^FWETA-[A-Z0-9]{6}$/);
  assert.notEqual(first, second);
  assert.equal(first, bioCodeForAccount("user-1", "11111111-1111-4111-8111-111111111111"));
});

test("a new bio code is short, unique, and a rejection needs a reason", () => {
  const first = generateBioCode();
  const second = generateBioCode([first]);
  assert.match(first, /^FWETA-[A-Z2-9]{6}$/);
  assert.notEqual(first, second);
  assert.equal(reviewDecisionError("verified", ""), null);
  assert.equal(reviewDecisionError("rejected", "no"), "Add a short reason for the rejection.");
  assert.equal(reviewDecisionError("rejected", "Code was not in the bio."), null);
  assert.match(bioHintLabel("match"), /Still confirm it yourself/);
  assert.match(bioHintLabel(null), /Open the profile/);
});

test("only a verified account can be selected for a clip", () => {
  const accounts = [
    account({ id: "a", platform: "tiktok", handle: "one", status: "pending" }),
    account({ id: "b", platform: "tiktok", handle: "two", status: "review" }),
    account({ id: "c", platform: "tiktok", handle: "three", status: "rejected" }),
    account({ id: "d", platform: "tiktok", handle: "four", status: "verified" }),
  ];
  const usable = verifiedAccountsForPlatform(accounts, "user-1", "tiktok");
  assert.deepEqual(usable.map((item) => item.id), ["d"]);
});

test("a creator can connect several accounts on one platform and pick a default", () => {
  const accounts = [
    account({ id: "a", platform: "tiktok", handle: "one", isDefault: true }),
    account({ id: "b", platform: "tiktok", handle: "two" }),
  ];
  const added = assertCanAddAccount(accounts, "user-1", "tiktok", "@three");
  assert.deepEqual(added, { handle: "three" });
  assert.equal("error" in assertCanAddAccount(accounts, "user-1", "tiktok", "one"), true);

  const next = withDefault(accounts, "user-1", "b");
  assert.equal(next.find((item) => item.id === "a")?.isDefault, false);
  assert.equal(next.find((item) => item.id === "b")?.isDefault, true);
});

test("submission stats stay on the account they came from", () => {
  const accounts = [
    account({ id: "a", platform: "tiktok", handle: "one", status: "verified" }),
    account({ id: "b", platform: "instagram", handle: "two", status: "verified" }),
  ];
  const submissions: Submission[] = [
    submission({
      id: "s1",
      campaignId: "c1",
      clipperId: "user-1",
      views: 2500,
      earningsCents: 500,
      socialAccountId: "a",
    }),
  ];
  const stats = statsByAccount(accounts, submissions);
  assert.equal(stats.find((item) => item.accountId === "a")?.views, 2500);
  assert.equal(stats.find((item) => item.accountId === "b")?.submissions, 0);
});

test("a brand can own a workspace and invite a viewer, not the other way around", () => {
  const store = emptyStore();
  const owner = profile({
    id: "brand-1",
    email: "brand@fweta.test",
    roles: ["brand"],
    primaryRole: "brand",
    companyName: "Desert Brands",
  });
  store.profiles.push(owner);
  store.campaigns.push(campaign({ id: "camp-1", brandId: owner.id }));

  let n = 0;
  const workspaceId = ensureOwnedWorkspace(store, owner, "2026-01-03T00:00:00.000Z", () => `id-${n++}`);
  assert.ok(workspaceId);
  assert.equal(store.campaigns[0]?.workspaceId, workspaceId);
  assert.equal(canInviteRole("owner", false, "manager"), true);
  assert.equal(canInviteRole("viewer", false, "manager"), false);
  assert.equal(canInviteRole("manager", false, "viewer"), true);

  store.workspaceMembers.push({
    id: "member-2",
    workspaceId: workspaceId!,
    userId: "viewer-1",
    email: "viewer@fweta.test",
    role: "viewer",
    status: "active",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  });
  const viewer = { id: "viewer-1", roles: ["brand"] };
  assert.equal(canEditCampaign(store, viewer, store.campaigns[0]!), false);
  assert.equal(campaignsVisibleToBrand(store, viewer).length, 1);
  owner.activeWorkspaceId = "other";
  assert.equal(campaignsVisibleToBrand(store, owner).some((campaign) => campaign.id === "camp-1"), false);
});

test("first-run moments follow the brand and creator sequences", () => {
  const store = emptyStore();
  const brand = profile({
    id: "brand-1",
    email: "brand@fweta.test",
    roles: ["brand"],
    primaryRole: "brand",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
    onboarding: {
      version: 1,
      stepId: "tour",
      completed: ["name"],
      skipped: [],
      firstName: "Lena",
      lastName: "Shipanga",
      phone: "",
      interests: [],
      location: "",
      companyName: "Desert Brands",
      website: "",
      promote: "",
      socials: {},
      brandSocials: {},
      checks: [],
      payoutSaved: false,
      campaignId: null,
      minViews: null,
      depositSeen: true,
      productTourSeen: true,
      checklistDismissed: false,
      updatedAt: "2026-02-01T00:00:00.000Z",
    },
  });
  store.profiles.push(brand);
  const first = openJourneyMoment(journeyFactsFromStore(store, brand, "brand"));
  assert.equal(first?.id, "first_campaign");

  store.campaigns.push(
    campaign({
      id: "camp-1",
      brandId: brand.id,
      createdAt: "2026-02-02T00:00:00.000Z",
      updatedAt: "2026-02-02T00:00:00.000Z",
    }),
  );
  assert.equal(openJourneyMoment(journeyFactsFromStore(store, brand, "brand"))?.id, "campaign_funded");

  store.brandDeposits.push({
    id: "dep-1",
    brandId: brand.id,
    amountCents: 100000,
    note: "EFT",
    status: "credited",
    bankReference: null,
    createdAt: "2026-02-03T00:00:00.000Z",
    confirmedAt: "2026-02-03T00:00:00.000Z",
    confirmedBy: "admin-1",
  });
  assert.equal(openJourneyMoment(journeyFactsFromStore(store, brand, "brand"))?.id, "campaign_live");

  const creator = profile({
    id: "creator-1",
    email: "creator@fweta.test",
    roles: ["clipper"],
    primaryRole: "clipper",
    onboardingCompletedAt: "2026-02-01T00:00:00.000Z",
    onboarding: brand.onboarding,
  });
  store.profiles.push(creator);
  assert.equal(openJourneyMoment(journeyFactsFromStore(store, creator, "clipper"))?.id, "first_submission");
  store.submissions.push(
    submission({
      id: "sub-1",
      campaignId: "camp-1",
      clipperId: creator.id,
      views: 1000,
      earningsCents: 200,
      createdAt: "2026-02-04T00:00:00.000Z",
      updatedAt: "2026-02-04T00:00:00.000Z",
    }),
  );
  const creatorFacts = journeyFactsFromStore(store, creator, "clipper");
  assert.equal(momentIsDone(JOURNEY_MOMENTS.find((moment) => moment.id === "first_review" && moment.audience === "creator")!, creatorFacts), true);
  assert.equal(openJourneyMoment(creatorFacts)?.id, "first_withdrawal");
});

test("admin moments start with the pay-in check", () => {
  const store = emptyStore();
  const admin = profile({
    id: "admin-1",
    email: "admin@fweta.test",
    roles: ["admin"],
    primaryRole: "admin",
  });
  assert.equal(openJourneyMoment(journeyFactsFromStore(store, admin, "admin"))?.id, "admin_payin");
  const snap: ViewSnapshot = {
    id: "snap-1",
    submissionId: "sub-1",
    views: 1000,
    likes: null,
    comments: null,
    note: null,
    screenshotPath: null,
    recordedAt: "2026-02-05T00:00:00.000Z",
    checkedBy: "admin-1",
    source: "admin",
    status: "confirmed",
  };
  store.viewSnapshots.push(snap);
  store.brandDeposits.push({
    id: "dep-1",
    brandId: "brand-1",
    amountCents: 100,
    note: "EFT",
    status: "credited",
    bankReference: null,
    createdAt: "2026-02-05T00:00:00.000Z",
    confirmedAt: "2026-02-05T00:00:00.000Z",
    confirmedBy: "admin-1",
  });
  assert.equal(openJourneyMoment(journeyFactsFromStore(store, admin, "admin")), null);
});

test("help and journey copy have no em dashes", () => {
  for (const line of [...collectJourneyCopy(), ...collectHelpCopy()]) {
    assert.equal(line.includes("\u2014"), false, line);
    assert.equal(line.includes("\u2013"), false, line);
  }
});
