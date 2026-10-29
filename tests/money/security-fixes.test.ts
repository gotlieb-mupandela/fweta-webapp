import assert from "node:assert/strict";
import test from "node:test";

import { allocateCampaignFunds } from "../../lib/campaigns/fund";
import { filterDiscoverableCampaigns } from "../../lib/campaigns/public";
import { creditSubmissionEarnings } from "../../lib/campaigns/earnings";
import { refundUndeliveredBooking } from "../../lib/bookings/refund";
import { applyHousekeeping } from "../../lib/jobs/housekeeping";
import { pollSubmissionViews } from "../../lib/jobs/poll-submission-views";
import { depositAmountError, MAX_DEPOSIT_CENTS } from "../../lib/money/cents";
import { FWETA_EFT_INSTRUCTIONS, depositReferenceFor } from "../../lib/payments/eft-instructions";
import { bankReferenceTaken } from "../../lib/payments/references";
import { imageKindForUpload } from "../../lib/kyc/magic";
import { postUrlMatchesPlatform } from "../../lib/clips/post-url";
import { contentSecurityPolicy } from "../../lib/security/csp";
import { withdrawalIdentityError } from "../../lib/wallet/payout-guard";
import { EARNING_WINDOW_MS, FRAUD_HOLD_MS, hydrateCampaign, hydrateSubmission } from "../../lib/rewards/content-rewards";
import { applyConfirmedViews, settleSubmission } from "../../lib/rewards/earnings";
import { clipEarnedCents } from "../../lib/rewards/paid";
import { applyClipReview } from "../../lib/rewards/review";
import { campaignCreateSchema } from "../../lib/validations/campaign";
import { onboardingPayoutSchema } from "../../lib/validations/onboarding";
import { payoutMethodSchema } from "../../lib/validations/payout-method";
import { payInRequestSchema } from "../../lib/validations/accounts";
import { submissionSchema } from "../../lib/validations/submission";
import type { Booking, BrandDeposit, Campaign, DatabaseStore, LedgerEntry, Submission, WithdrawalRequest } from "../../lib/db/types";
import { exportedAsyncFunctions, readRepo } from "../security/scan-actions";

const brand = "11111111-1111-4111-8111-111111111111";
const clipper = "22222222-2222-4222-8222-222222222222";
const now = Date.parse("2026-10-17T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;

function wallet(userId: string, availableCents: number, pendingCents = 0) {
  return { userId, availableCents, pendingCents, updatedAt: new Date(now).toISOString() };
}

function campaign(partial: Partial<Campaign> & Pick<Campaign, "id" | "budgetTotalCents" | "cpmCents">): Campaign {
  return hydrateCampaign({
    brandId: brand,
    title: "QA",
    description: "Cut",
    type: "clipping",
    category: "podcast",
    status: "active",
    payModel: "cpm",
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
    maxPayoutPerSubmissionCents: 100_000,
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
    status: "pending",
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
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...partial,
  });
}

function store(campaigns: Campaign[], submissions: Submission[], available = 1_000_000): DatabaseStore {
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

function clipperWallet(db: DatabaseStore) {
  const row = db.wallets.find((item) => item.userId === clipper);
  if (!row) throw new Error("missing clipper wallet");
  return row;
}

test("approval then a higher view count pays once and stops at the per-post cap", () => {
  const camp = campaign({ id: "33333333-3333-4333-8333-333333333333", budgetTotalCents: 5_000_000, cpmCents: 5_000 });
  const sub = submission({ id: "44444444-4444-4444-8444-444444444444", campaignId: camp.id });
  const db = store([camp], [sub]);
  applyClipReview(db, sub.id, { status: "approved", views: 10_000 }, now);
  assert.equal(clipperWallet(db).availableCents, 0);
  assert.equal(clipperWallet(db).pendingCents, 50_000);
  applyConfirmedViews(db, sub.id, 20_000, null, null, now);
  applyConfirmedViews(db, sub.id, 30_000, null, null, now);
  assert.equal(clipperWallet(db).availableCents, 0);
  assert.equal(clipperWallet(db).pendingCents, 100_000);
  assert.equal(sub.reservedCents + sub.releasedCents, 100_000);
  assert.equal(db.ledgerEntries.some((entry) => entry.referenceType === "campaign_earning"), false);
});

test("a later view save subtracts a legacy available credit and still respects the cap", () => {
  const camp = campaign({
    id: "55555555-5555-4555-8555-555555555555",
    budgetTotalCents: 5_000_000,
    cpmCents: 5_000,
    budgetSpentCents: 50_000,
  });
  const sub = submission({
    id: "66666666-6666-4666-8666-666666666666",
    campaignId: camp.id,
    status: "approved",
    views: 10_000,
    approvedAt: new Date(now).toISOString(),
    earningUntil: new Date(now + EARNING_WINDOW_MS).toISOString(),
    payoutState: "none",
    earningsCents: 50_000,
  });
  const db = store([camp], [sub]);
  clipperWallet(db).availableCents = 50_000;
  db.ledgerEntries.push({
    id: "legacy-earning",
    userId: clipper,
    amountCents: 50_000,
    type: "credit",
    reason: "Campaign earnings",
    referenceType: "campaign_earning",
    referenceId: sub.id,
    balanceAfterAvailableCents: 50_000,
    balanceAfterPendingCents: 0,
    createdAt: new Date(now).toISOString(),
  });
  applyConfirmedViews(db, sub.id, 20_000, null, null, now);
  const walletRow = clipperWallet(db);
  assert.equal(walletRow.availableCents, 50_000);
  assert.equal(walletRow.pendingCents, 50_000);
  assert.equal(walletRow.availableCents + walletRow.pendingCents, 100_000);
});

test("approval earnings stay pending through the 7 day window and 3 day hold", () => {
  const camp = campaign({ id: "77777777-7777-4777-8777-777777777777", budgetTotalCents: 5_000_000, cpmCents: 5_000 });
  const sub = submission({ id: "88888888-8888-4888-8888-888888888888", campaignId: camp.id });
  const db = store([camp], [sub]);
  applyClipReview(db, sub.id, { status: "approved", views: 10_000 }, now);
  assert.equal(clipperWallet(db).availableCents, 0);
  assert.equal(clipperWallet(db).pendingCents, 50_000);
  assert.equal(sub.payoutState, "reserved");
  assert.equal(Date.parse(sub.holdUntil ?? ""), now + EARNING_WINDOW_MS + FRAUD_HOLD_MS);
  settleSubmission(db, sub.id, now + day, true, true);
  assert.equal(clipperWallet(db).availableCents, 0);
  assert.equal(clipperWallet(db).pendingCents, 50_000);
  settleSubmission(db, sub.id, now + EARNING_WINDOW_MS + FRAUD_HOLD_MS, true, true);
  assert.equal(clipperWallet(db).pendingCents, 0);
  assert.equal(clipperWallet(db).availableCents, 50_000);
});

test("the old earnings helper no longer credits Available", () => {
  const camp = campaign({ id: "99999999-9999-4999-8999-999999999999", budgetTotalCents: 5_000_000, cpmCents: 5_000 });
  const sub = submission({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    campaignId: camp.id,
    status: "approved",
    views: 10_000,
  });
  const db = store([camp], [sub]);
  const credited = creditSubmissionEarnings(db, sub.id);
  assert.equal(clipperWallet(db).availableCents, 0);
  assert.equal(clipperWallet(db).pendingCents, 50_000);
  assert.equal(credited, 50_000);
});

test("publishing reserves the platform fee with the budget", () => {
  const camp = campaign({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", budgetTotalCents: 40_000, cpmCents: 5_000 });
  const db = store([camp], [], 100_000);
  db.platformSettings = [{ id: "default", platformFeeBps: 1250, updatedAt: new Date(now).toISOString(), updatedBy: null }];
  allocateCampaignFunds(db, camp);
  assert.equal(db.wallets[0].availableCents, 55_000);
  assert.equal(camp.feeBps, 1250);
  assert.equal(camp.feeReservedCents, 5_000);
  assert.equal(
    db.ledgerEntries.find((entry) => entry.referenceType === "campaign_fee")?.amountCents,
    5_000,
  );
  const source = readRepo("app/actions/campaigns.ts");
  assert.match(source, /allocateCampaignFunds/);
  assert.equal(source.includes("Campaign budget allocated"), false);
});

test("payout identity is required before a withdrawal or a paid mark", () => {
  assert.equal(withdrawalIdentityError(null), "ID must be verified before a payout.");
  assert.equal(
    withdrawalIdentityError({
      legalName: "Kai",
      idNumberEnc: "enc",
      country: "NA",
      submittedAt: new Date(now).toISOString(),
      documentPath: "id.png",
      status: "pending",
    }),
    "ID must be verified before a payout.",
  );
  assert.equal(
    withdrawalIdentityError({
      legalName: "Kai",
      idNumberEnc: "enc",
      country: "NA",
      submittedAt: new Date(now).toISOString(),
      documentPath: "id.png",
      status: "verified",
    }),
    null,
  );
  const walletSource = readRepo("app/actions/wallet.ts");
  const actions = exportedAsyncFunctions(walletSource);
  for (const name of ["requestWithdrawalAction", "markWithdrawalPaidAction"]) {
    const body = actions.find((action) => action.name === name)?.body ?? "";
    assert.match(body, /withdrawalIdentityError/);
  }
  assert.match(readRepo("app/dashboard/admin/withdrawals/page.tsx"), /ID verified/);
  assert.match(readRepo("app/dashboard/admin/withdrawals/page.tsx"), /ID missing/);
});

test("admin money actions write an audit entry in the same update", () => {
  const actions = exportedAsyncFunctions(readRepo("app/actions/wallet.ts"));
  for (const name of [
    "adminCreditWalletAction",
    "confirmBrandDepositAction",
    "rejectBrandDepositAction",
    "markWithdrawalPaidAction",
    "rejectWithdrawalAction",
  ]) {
    const body = actions.find((action) => action.name === name)?.body ?? "";
    assert.match(body, /pushAudit\(/, name);
  }
  const refund = exportedAsyncFunctions(readRepo("app/actions/bookings.ts")).find(
    (action) => action.name === "adminRefundBookingAction",
  );
  assert.match(refund?.body ?? "", /pushAudit\(/);
});

test("deposits reject amounts above N$1,000,000 and reused bank references", () => {
  assert.equal(MAX_DEPOSIT_CENTS, 100_000_000);
  assert.equal(depositAmountError(100_000_000), null);
  assert.equal(depositAmountError(100_000_001), "Deposit cannot exceed N$1,000,000.");
  assert.equal(payInRequestSchema.safeParse({ amountCents: 10_000_000_000_000 }).success, false);
  const deposit: BrandDeposit = {
    id: "d1",
    brandId: brand,
    amountCents: 10_000,
    note: "EFT",
    status: "credited",
    bankReference: "Fweta-Ref",
    confirmedBy: brand,
    confirmedAt: new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
  const rejected: BrandDeposit = { ...deposit, id: "d2", status: "rejected", bankReference: "other-ref" };
  const withdrawal: WithdrawalRequest = {
    id: "w1",
    userId: clipper,
    payoutMethodId: "p1",
    amountCents: 10_000,
    status: "paid",
    bankReference: "PAY-1",
    adminNote: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    paidAt: new Date(now).toISOString(),
  };
  const rows = { brandDeposits: [deposit, rejected], withdrawalRequests: [withdrawal] };
  assert.equal(bankReferenceTaken(rows, "fweta-ref"), true);
  assert.equal(bankReferenceTaken(rows, "other-ref"), false);
  assert.equal(bankReferenceTaken(rows, "pay-1", { withdrawalId: "w1" }), false);
  assert.equal(bankReferenceTaken(rows, "pay-1"), true);
});

test("paid clip totals come from the ledger when earningsCents was cleared", () => {
  const entry: LedgerEntry = {
    id: "earn-1",
    userId: clipper,
    amountCents: 100_000,
    type: "credit",
    reason: "Campaign earnings",
    referenceType: "campaign_earning",
    referenceId: "sub-1",
    balanceAfterAvailableCents: 100_000,
    balanceAfterPendingCents: 0,
    createdAt: new Date(now).toISOString(),
  };
  const release: LedgerEntry = { ...entry, id: "rel-1", referenceType: "campaign_release", amountCents: 100_000 };
  assert.equal(clipEarnedCents([entry, release], { id: "sub-1", reservedCents: 0, releasedCents: 0 }), 100_000);
  assert.match(readRepo("components/dashboard/brand-submission-queue.tsx"), /clipEarnedCents/);
  assert.match(readRepo("app/dashboard/brand/campaigns/[id]/submissions/page.tsx"), /clipEarnedCents/);
});

test("an accepted booking with no delivery can be refunded, including after 14 days", () => {
  const db = store([], []);
  const booking: Booking = {
    id: "booking-1",
    brandId: brand,
    influencerId: clipper,
    influencerProfileId: "profile-1",
    rateCardItemId: null,
    kind: "public",
    amountCents: 30_000,
    brief: "One post",
    deliverableUrl: null,
    status: "accepted",
    createdAt: new Date(now - 20 * day).toISOString(),
    updatedAt: new Date(now - 20 * day).toISOString(),
  };
  db.bookings.push(booking);
  db.wallets[0].pendingCents = 30_000;
  assert.equal(refundUndeliveredBooking(db, booking.id, new Date(now).toISOString()), true);
  assert.equal(booking.status, "cancelled");
  assert.equal(db.wallets[0].availableCents, 1_030_000);
  assert.equal(db.wallets[0].pendingCents, 0);

  const held = store([], []);
  const stale: Booking = { ...booking, id: "booking-2", status: "accepted" };
  held.bookings.push(stale);
  held.wallets[0].availableCents = 0;
  held.wallets[0].pendingCents = 30_000;
  const result = applyHousekeeping(held, new Date(now));
  assert.equal(result.bookingsRefunded, 1);
  assert.equal(stale.status, "cancelled");
  assert.equal(held.wallets[0].availableCents, 30_000);

  const delivered = store([], []);
  delivered.bookings.push({ ...booking, id: "booking-3", deliverableUrl: "https://tiktok.com/@kai/video/1" });
  delivered.wallets[0].pendingCents = 30_000;
  assert.equal(refundUndeliveredBooking(delivered, "booking-3"), false);
  assert.match(readRepo("app/dashboard/admin/bookings/page.tsx"), /adminRefundBookingAction|BookingAdminRefund/);
  assert.match(readRepo("components/forms/booking-admin-refund.tsx"), /Refund to brand/);
});

test("past end dates are rejected and ended campaigns leave the open lists", () => {
  const base = {
    title: "Windhoek clips",
    description: "Cut the podcast into short clips.",
    type: "clipping" as const,
    category: "podcast",
    budgetTotalCents: 40_000,
    cpmCents: 5_000,
    maxPayoutPerSubmissionCents: 10_000,
    platforms: ["tiktok" as const],
  };
  assert.equal(campaignCreateSchema.safeParse(base).success, true);
  const past = campaignCreateSchema.safeParse({ ...base, endDate: "2020-01-01" });
  assert.equal(past.success, false);
  if (!past.success) assert.match(past.error.issues[0]?.message ?? "", /End date must be in the future/);
  const open = campaign({ id: "open-campaign", budgetTotalCents: 40_000, cpmCents: 5_000 });
  const ended = campaign({ id: "ended-campaign", budgetTotalCents: 40_000, cpmCents: 5_000, endDate: "2020-01-01" });
  const visible = filterDiscoverableCampaigns([open, ended], undefined, now);
  assert.deepEqual(visible.map((item) => item.id), ["open-campaign"]);
  const submit = exportedAsyncFunctions(readRepo("app/actions/submissions.ts")).find(
    (action) => action.name === "submitClipAction",
  );
  assert.match(submit?.body ?? "", /campaignIsDiscoverable/);
});

test("clip links must match the platform and a verified account is required on the server", () => {
  assert.equal(postUrlMatchesPlatform("https://example.com/video", "tiktok"), false);
  assert.equal(postUrlMatchesPlatform("https://www.tiktok.com/@kai/video/1", "tiktok"), true);
  assert.equal(postUrlMatchesPlatform("https://youtu.be/abc", "youtube"), true);
  assert.equal(postUrlMatchesPlatform("https://twitter.com/kai/status/1", "x"), true);
  const bad = submissionSchema.safeParse({
    campaignId: "33333333-3333-4333-8333-333333333333",
    postUrl: "https://example.com/video",
    platform: "tiktok",
  });
  assert.equal(bad.success, false);
  const submit = exportedAsyncFunctions(readRepo("app/actions/submissions.ts")).find(
    (action) => action.name === "submitClipAction",
  );
  assert.match(submit?.body ?? "", /verifiedAccountsForPlatform/);
  assert.match(submit?.body ?? "", /postUrlMatchesPlatform/);
});

test("a rejected clip cannot be approved again", () => {
  const camp = campaign({ id: "rejected-camp", budgetTotalCents: 5_000_000, cpmCents: 5_000 });
  const sub = submission({ id: "rejected-sub", campaignId: camp.id });
  const db = store([camp], [sub]);
  applyClipReview(db, sub.id, { status: "approved", views: 10_000 }, now);
  applyClipReview(db, sub.id, { status: "rejected" }, now);
  assert.equal(sub.status, "rejected");
  assert.throws(
    () => applyClipReview(db, sub.id, { status: "approved", views: 20_000 }, now),
    /A rejected clip cannot be approved/,
  );
  assert.equal(clipperWallet(db).pendingCents, 50_000);
  assert.equal(clipperWallet(db).availableCents, 0);
});

test("account numbers are digits only and payout copy says Namibian EFT", () => {
  const base = {
    bankName: "Bank Windhoek",
    branchCode: "461266",
    accountHolderName: "Kai N",
    accountType: "cheque" as const,
  };
  assert.equal(payoutMethodSchema.safeParse({ ...base, accountNumber: "ABCDEFGHIJ" }).success, false);
  assert.equal(onboardingPayoutSchema.safeParse({ ...base, accountNumber: "ABCDEFGHIJ" }).success, false);
  assert.equal(payoutMethodSchema.safeParse({ ...base, accountNumber: "12345678" }).success, true);
  const page = readRepo("app/dashboard/settings/payout/page.tsx");
  assert.match(page, /Namibian EFT/);
  assert.equal(page.includes("SA EFT"), false);
});

test("deposit instructions are placeholders and name a reference", () => {
  assert.equal(FWETA_EFT_INSTRUCTIONS.accountNumber, "PLACEHOLDER");
  assert.equal(FWETA_EFT_INSTRUCTIONS.branchCode, "PLACEHOLDER");
  assert.equal(/\d{6,}/.test(FWETA_EFT_INSTRUCTIONS.accountNumber), false);
  assert.match(FWETA_EFT_INSTRUCTIONS.warning, /placeholder/i);
  assert.equal(depositReferenceFor("user-abc12345xyz"), "FWETA-USERABC1");
  assert.match(readRepo("app/dashboard/brand/deposits/page.tsx"), /depositReferenceFor/);
});

test("ID uploads must match PNG, JPEG, or WebP magic bytes", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const text = new TextEncoder().encode("this is not a photo");
  assert.equal(imageKindForUpload("image/png", png), "png");
  assert.equal(imageKindForUpload("image/png", text), null);
  assert.equal(imageKindForUpload("image/jpeg", png), null);
});

test("the content security policy and action logging stay closed", () => {
  const policy = contentSecurityPolicy({ supabaseHost: "abc.supabase.co", allowEval: false });
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /https:\/\/abc\.supabase\.co/);
  assert.equal(policy.includes("unsafe-eval"), false);
  assert.match(contentSecurityPolicy({ allowEval: true }), /unsafe-eval/);
  const config = readRepo("next.config.ts");
  assert.match(config, /serverFunctions:\s*false/);
  assert.match(config, /contentSecurityPolicy/);
  for (const relative of ["app/actions/auth.ts", "app/actions/wallet.ts"]) {
    assert.equal(/console\.(log|info|debug)\(/.test(readRepo(relative)), false, relative);
  }
});

test("the store health route is locked before it returns counts", () => {
  const source = readRepo("app/api/health/store/route.ts");
  assert.ok(source.indexOf("Unauthorized") >= 0);
  assert.ok(source.indexOf("Unauthorized") < source.indexOf("profileCount"));
  assert.match(source, /getSession/);
  assert.match(source, /authorizeCron/);
});

test("view polling does nothing unless Apify is configured", async () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.APIFY_API_TOKEN;
  delete env.APIFY_API_TOKEN;
  try {
    const result = await pollSubmissionViews();
    assert.deepEqual(result, { updated: 0, failed: 0, mode: "off", creditedCents: 0 });
  } finally {
    if (previous == null) delete env.APIFY_API_TOKEN;
    else env.APIFY_API_TOKEN = previous;
  }
});

test("campaign reads require the owner and public pages do not use the private action", () => {
  const getCampaign = exportedAsyncFunctions(readRepo("app/actions/campaigns.ts")).find(
    (action) => action.name === "getCampaign",
  );
  assert.match(getCampaign?.body ?? "", /canViewCampaign/);
  const page = readRepo("app/campaigns/[id]/page.tsx");
  assert.match(page, /getPublicCampaign/);
  assert.equal(page.includes("getCampaign"), false);
});
