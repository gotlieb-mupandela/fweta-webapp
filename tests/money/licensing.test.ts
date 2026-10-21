import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseStore, Profile, UgcFile } from "../../lib/db/types";
import {
  applyToBrief,
  approveDelivery,
  buildLicenseSummary,
  closeBrief,
  createBrief,
  decideApplication,
  declineDelivery,
  requestRevision,
  splitCreatorIncome,
  submitDelivery,
  type LicensingActor,
  type LicensingClock,
} from "../../lib/licensing/hub";

const brandId = "11111111-1111-4111-8111-111111111111";
const creatorId = "22222222-2222-4222-8222-222222222222";

function profile(id: string, name: string, roles: Profile["roles"]): Profile {
  return {
    id,
    email: `${id}@fweta.test`,
    displayName: name,
    passwordHash: "x",
    bio: "",
    avatarUrl: null,
    roles,
    primaryRole: roles[0],
    notifyEmail: false,
    notifyWithdrawals: false,
    notifyBookings: false,
    createdAt: "2026-10-18T12:00:00.000Z",
    updatedAt: "2026-10-18T12:00:00.000Z",
    suspended: false,
  };
}

function empty(available = 100_000): DatabaseStore {
  return {
    profiles: [profile(brandId, "Desert Brands", ["brand"]), profile(creatorId, "Amara Nangolo", ["clipper", "influencer"])],
    campaigns: [],
    submissions: [],
    viewSnapshots: [],
    wallets: [
      { userId: brandId, availableCents: available, pendingCents: 0, updatedAt: "2026-10-18T12:00:00.000Z" },
      { userId: creatorId, availableCents: 0, pendingCents: 0, updatedAt: "2026-10-18T12:00:00.000Z" },
    ],
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

function clock(): LicensingClock {
  let n = 0;
  return {
    id: () => {
      n += 1;
      return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    },
    now: () => "2026-10-18T12:00:00.000Z",
  };
}

const brand: LicensingActor = { id: brandId, roles: ["brand"], displayName: "Desert Brands" };
const creator: LicensingActor = { id: creatorId, roles: ["clipper", "influencer"], displayName: "Amara Nangolo" };

const video: UgcFile = {
  id: "file-1",
  name: "00000000-0000-4000-8000-000000000099.mp4",
  originalName: "clip.mp4",
  kind: "video",
};

function open(store: DatabaseStore, videoCount = 2) {
  return createBrief(
    store,
    brand,
    {
      title: "Summer ads",
      summary: "One product video for paid ads. Do not post it on your feed.",
      format: "vertical",
      lengthSeconds: 20,
      videoCount,
      rawFiles: false,
      usage: "paid",
      termMonths: 6,
      platforms: ["tiktok", "instagram"],
      territory: "Namibia",
      feePerAssetCents: 25_000,
      revisionLimit: 2,
      workspaceId: null,
      openNow: true,
    },
    clock(),
  );
}

test("opening a brief reserves fee times video count", () => {
  const store = empty();
  const brief = open(store);
  assert.equal(brief.budgetCents, 50_000);
  assert.equal(brief.budgetReservedCents, 50_000);
  assert.equal(store.wallets.find((wallet) => wallet.userId === brandId)?.availableCents, 50_000);
  assert.equal(store.ledgerEntries[0]?.referenceType, "ugc_reserve");
  assert.equal(store.ledgerEntries[0]?.type, "debit");
});

test("a short wallet does not create the brief", () => {
  const store = empty(1_000);
  assert.throws(() => open(store), /Insufficient/);
  assert.equal(store.ugcBriefs.length, 0);
  assert.equal(store.ledgerEntries.length, 0);
});

test("approval pays the creator, writes a license, and close returns the rest", () => {
  const store = empty();
  const tick = clock();
  const brief = createBrief(
    store,
    brand,
    {
      title: "Summer ads",
      summary: "One product video for paid ads. Do not post it on your feed.",
      format: "vertical",
      lengthSeconds: 20,
      videoCount: 2,
      rawFiles: false,
      usage: "paid",
      termMonths: 6,
      platforms: ["tiktok"],
      territory: "Namibia",
      feePerAssetCents: 25_000,
      revisionLimit: 2,
      workspaceId: null,
      openNow: true,
    },
    tick,
  );
  const application = applyToBrief(store, creator, brief.id, "I can film this week.", tick);
  decideApplication(store, brand, application.id, true, tick);
  const delivery = submitDelivery(store, creator, application.id, [video], tick);
  requestRevision(store, brand, delivery.id, "Start on the product.", tick);
  assert.equal(delivery.revisionCount, 1);
  submitDelivery(store, creator, application.id, [video], tick);
  requestRevision(store, brand, delivery.id, "Shorter hook.", tick);
  submitDelivery(store, creator, application.id, [video], tick);
  assert.throws(() => requestRevision(store, brand, delivery.id, "One more pass.", tick), /Revision limit/);

  const license = approveDelivery(store, brand, delivery.id, tick);
  assert.equal(license.feeCents, 25_000);
  assert.equal(license.endsAt.slice(0, 10), "2027-04-18");
  assert.equal(license.summary.includes("\u2014"), false);
  assert.equal(license.summary.includes("paid ads"), true);
  assert.equal(license.summary.includes("does not have to post"), true);
  assert.equal(brief.budgetReservedCents, 25_000);
  assert.equal(store.wallets.find((wallet) => wallet.userId === creatorId)?.availableCents, 25_000);
  assert.equal(store.ledgerEntries.some((entry) => entry.referenceType === "ugc_fee" && entry.userId === creatorId), true);

  assert.throws(() => approveDelivery(store, brand, delivery.id, tick), /not waiting/);
  closeBrief(store, brand, brief.id, tick);
  assert.equal(brief.budgetReservedCents, 0);
  assert.equal(brief.status, "closed");
  assert.equal(store.wallets.find((wallet) => wallet.userId === brandId)?.availableCents, 75_000);
  assert.equal(store.ledgerEntries.some((entry) => entry.referenceType === "ugc_release"), true);
  const income = splitCreatorIncome(store.ledgerEntries.filter((entry) => entry.userId === creatorId));
  assert.deepEqual(income, { viewCents: 0, ugcCents: 25_000 });
});

test("decline does not pay and close is blocked while a file is in review", () => {
  const store = empty();
  const tick = clock();
  const brief = open(store, 1);
  const application = applyToBrief(store, creator, brief.id, "", tick);
  decideApplication(store, brand, application.id, true, tick);
  const delivery = submitDelivery(store, creator, application.id, [video], tick);
  assert.throws(() => closeBrief(store, brand, brief.id, tick), /Review open deliveries/);
  declineDelivery(store, brand, delivery.id, tick);
  assert.equal(store.contentLicenses.length, 0);
  assert.equal(store.wallets.find((wallet) => wallet.userId === creatorId)?.availableCents, 0);
  closeBrief(store, brand, brief.id, tick);
  assert.equal(store.wallets.find((wallet) => wallet.userId === brandId)?.availableCents, 100_000);
});

test("license summary has no em dash", () => {
  const summary = buildLicenseSummary({
    id: "lic-1",
    briefId: "b",
    deliveryId: "d",
    brandId,
    creatorId,
    title: "Summer ads",
    feeCents: 25000,
    usage: "organic_and_paid",
    termMonths: 12,
    platforms: ["youtube"],
    territory: "SADC",
    format: "square",
    lengthSeconds: 15,
    rawFiles: true,
    brandName: "Desert Brands",
    creatorName: "Amara Nangolo",
    startsAt: "2026-10-18T12:00:00.000Z",
    endsAt: "2027-10-18T12:00:00.000Z",
    createdAt: "2026-10-18T12:00:00.000Z",
  });
  assert.equal(summary.includes("\u2014") || summary.includes("\u2013"), false);
});
