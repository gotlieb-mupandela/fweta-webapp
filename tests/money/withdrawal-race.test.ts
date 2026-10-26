import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { refundRequestedBooking } from "../../lib/bookings/escrow";
import type { Booking, DatabaseStore, Profile, WithdrawalRequest } from "../../lib/db/types";
import { creditWalletInStore } from "../../lib/wallet/admin-credit";
import { markWithdrawalPaidInStore, rejectWithdrawalInStore } from "../../lib/wallet/withdrawal-state";
import { ADMIN_CREDIT_MAX_CENTS, adminCreditSchema } from "../../lib/validations/wallet";

const adminId = "11111111-1111-4111-8111-111111111111";
const adminEmail = "admin@fweta.test";
const userId = "22222222-2222-4222-8222-222222222222";
const brandId = "33333333-3333-4333-8333-333333333333";
const influencerId = "44444444-4444-4444-8444-444444444444";
const withdrawalId = "55555555-5555-4555-8555-555555555555";
const bookingId = "66666666-6666-4666-8666-666666666666";
const at = "2026-10-25T12:00:00.000Z";
const AMOUNT = 15_000;

/**
 * Same commit rule as updateStore: mutators run one at a time on a draft,
 * and a throw leaves the previous draft in place.
 */
function queuedStore(initial: DatabaseStore) {
  let current = structuredClone(initial);
  let tail: Promise<void> = Promise.resolve();

  return {
    snapshot(): DatabaseStore {
      return structuredClone(current);
    },
    update<T>(mutator: (draft: DatabaseStore) => T): Promise<T> {
      let value!: T;
      const run = tail.catch(() => undefined).then(async () => {
        const draft = structuredClone(current);
        value = await mutator(draft);
        current = draft;
        return value;
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
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

function profile(id: string, email: string): Profile {
  return {
    id,
    email,
    passwordHash: "hashed",
    displayName: email.split("@")[0],
    bio: "",
    avatarUrl: null,
    roles: ["clipper"],
    primaryRole: "clipper",
    notifyEmail: false,
    notifyWithdrawals: false,
    notifyBookings: false,
    createdAt: at,
    updatedAt: at,
    suspended: false,
  };
}

function pendingWithdrawal(): WithdrawalRequest {
  return {
    id: withdrawalId,
    userId,
    payoutMethodId: "77777777-7777-4777-8777-777777777777",
    amountCents: AMOUNT,
    status: "pending",
    bankReference: null,
    adminNote: null,
    createdAt: at,
    updatedAt: at,
    paidAt: null,
  };
}

function withdrawalStore(): DatabaseStore {
  const store = emptyStore();
  store.profiles.push(profile(userId, "clipper@fweta.test"));
  store.wallets.push({ userId, availableCents: 0, pendingCents: AMOUNT, updatedAt: at });
  store.withdrawalRequests.push(pendingWithdrawal());
  return store;
}

function bookingStore(): DatabaseStore {
  const store = emptyStore();
  store.wallets.push({ userId: brandId, availableCents: 0, pendingCents: AMOUNT, updatedAt: at });
  const booking: Booking = {
    id: bookingId,
    brandId,
    influencerId,
    influencerProfileId: "88888888-8888-4888-8888-888888888888",
    rateCardItemId: "99999999-9999-4999-8999-999999999999",
    amountCents: AMOUNT,
    brief: "One sponsored post for the launch.",
    deliverableUrl: null,
    status: "requested",
    createdAt: at,
    updatedAt: at,
  };
  store.bookings.push(booking);
  return store;
}

async function markPaid(db: ReturnType<typeof queuedStore>, reference: string) {
  try {
    await db.update((store) => {
      const outcome = markWithdrawalPaidInStore(store, withdrawalId, reference);
      if (!outcome.ok) throw new Error(outcome.error);
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Failed." };
  }
}

async function rejectWithdrawal(db: ReturnType<typeof queuedStore>) {
  try {
    await db.update((store) => {
      const outcome = rejectWithdrawalInStore(store, withdrawalId, "Duplicate click");
      if (!outcome.ok) throw new Error(outcome.error);
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Failed." };
  }
}

test("parallel mark-paid calls write one ledger row and one pending debit", async () => {
  const db = queuedStore(withdrawalStore());
  const [first, second] = await Promise.all([markPaid(db, "EFT-1"), markPaid(db, "EFT-2")]);
  const results = [first, second];
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok)?.error, "Already processed.");

  const store = db.snapshot();
  const paidRows = store.ledgerEntries.filter((row) => row.reason === "Withdrawal paid via EFT");
  assert.equal(paidRows.length, 1);
  assert.equal(paidRows[0]?.amountCents, AMOUNT);
  assert.equal(paidRows[0]?.referenceId, withdrawalId);
  assert.equal(store.ledgerEntries.length, 1);
  const wallet = store.wallets.find((row) => row.userId === userId);
  assert.equal(wallet?.pendingCents, 0);
  assert.equal(wallet?.availableCents, 0);
  assert.equal(store.withdrawalRequests[0]?.status, "paid");
  assert.equal(store.withdrawalRequests[0]?.bankReference, results[0]?.ok ? "EFT-1" : "EFT-2");
});

test("parallel reject calls restore the hold once", async () => {
  const db = queuedStore(withdrawalStore());
  const [first, second] = await Promise.all([rejectWithdrawal(db), rejectWithdrawal(db)]);
  assert.equal([first, second].filter((result) => result.ok).length, 1);
  assert.equal([first, second].find((result) => !result.ok)?.error, "Already processed.");

  const store = db.snapshot();
  const restored = store.ledgerEntries.filter((row) => row.reason === "Withdrawal rejected. Funds restored");
  assert.equal(restored.length, 1);
  assert.equal(restored[0]?.type, "credit");
  assert.equal(restored[0]?.amountCents, AMOUNT);
  const wallet = store.wallets.find((row) => row.userId === userId);
  assert.equal(wallet?.availableCents, AMOUNT);
  assert.equal(wallet?.pendingCents, 0);
  assert.equal(store.withdrawalRequests[0]?.status, "rejected");
});

test("a paid call racing a reject moves money once", async () => {
  const db = queuedStore(withdrawalStore());
  const results = await Promise.all([markPaid(db, "EFT-9"), rejectWithdrawal(db)]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok)?.error, "Already processed.");

  const store = db.snapshot();
  assert.equal(store.ledgerEntries.length, 1);
  const wallet = store.wallets.find((row) => row.userId === userId);
  const status = store.withdrawalRequests[0]?.status;
  if (status === "paid") {
    assert.equal(wallet?.availableCents, 0);
    assert.equal(wallet?.pendingCents, 0);
    assert.equal(store.ledgerEntries[0]?.type, "debit");
  } else {
    assert.equal(status, "rejected");
    assert.equal(wallet?.availableCents, AMOUNT);
    assert.equal(wallet?.pendingCents, 0);
    assert.equal(store.ledgerEntries[0]?.type, "credit");
  }
});

test("parallel booking declines refund escrow once", async () => {
  const db = queuedStore(bookingStore());
  const decline = () =>
    db.update((store) => {
      const outcome = refundRequestedBooking(
        store,
        bookingId,
        "Booking declined. Escrow refunded",
        influencerId,
      );
      if (!outcome.ok) throw new Error(outcome.reason);
    });

  const settled = await Promise.allSettled([decline(), decline()]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = settled.find((result) => result.status === "rejected");
  assert.equal(rejected?.status, "rejected");
  if (rejected?.status === "rejected") {
    assert.equal(rejected.reason instanceof Error ? rejected.reason.message : "", "already_handled");
  }

  const store = db.snapshot();
  const refunds = store.ledgerEntries.filter((row) => row.referenceType === "booking_refund");
  assert.equal(refunds.length, 1);
  assert.equal(refunds[0]?.amountCents, AMOUNT);
  const wallet = store.wallets.find((row) => row.userId === brandId);
  assert.equal(wallet?.availableCents, AMOUNT);
  assert.equal(wallet?.pendingCents, 0);
  assert.equal(store.bookings[0]?.status, "cancelled");
});

test("admin credit is bounded, requires a reason, and records the acting admin", () => {
  const reason = "EFT received 14 Oct";
  const requestKey = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const parsed = adminCreditSchema.safeParse({
    userId,
    amountCents: 25_000,
    reason: `  ${reason}  `,
    requestKey,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const store = emptyStore();
  store.profiles.push(profile(userId, "brand@fweta.test"));
  store.wallets.push({ userId, availableCents: 0, pendingCents: 0, updatedAt: at });
  const result = creditWalletInStore(store, {
    adminId,
    adminEmail,
    userId: parsed.data.userId,
    amountCents: parsed.data.amountCents,
    reason: parsed.data.reason,
    requestKey: parsed.data.requestKey,
  });
  assert.equal(result.ok, true);
  assert.equal(store.ledgerEntries.length, 1);
  assert.equal(store.ledgerEntries[0]?.actorId, adminId);
  assert.equal(store.ledgerEntries[0]?.actorEmail, adminEmail);
  assert.equal(store.ledgerEntries[0]?.userId, userId);
  assert.equal(store.ledgerEntries[0]?.amountCents, 25_000);
  assert.equal(store.ledgerEntries[0]?.reason, reason);
  assert.equal(store.ledgerEntries[0]?.requestKey, requestKey);
  assert.equal(store.wallets[0]?.availableCents, 25_000);

  const audit = store.auditLog.find((row) => row.action === "wallet.admin_credit");
  assert.ok(audit);
  assert.equal(audit?.actorId, adminId);
  assert.equal(audit?.actorEmail, adminEmail);
  assert.equal(audit?.targetId, userId);
  assert.equal(audit?.targetType, "profile");
  assert.equal(audit?.amountCents, 25_000);
  assert.equal(audit?.note, reason);
  assert.equal(Number.isNaN(Date.parse(audit?.createdAt ?? "")), false);
  assert.equal(JSON.stringify(audit).includes("accountNumber"), false);
  assert.equal(JSON.stringify(store.ledgerEntries[0]).includes("accountNumber"), false);

  const rejectedAmounts = [0, -100, 10.5, ADMIN_CREDIT_MAX_CENTS + 1, Number.NaN];
  for (const amountCents of rejectedAmounts) {
    assert.equal(
      adminCreditSchema.safeParse({ userId, amountCents, reason, requestKey }).success,
      false,
      `expected ${String(amountCents)} to fail`,
    );
  }
  assert.equal(
    adminCreditSchema.safeParse({ userId, amountCents: ADMIN_CREDIT_MAX_CENTS, reason, requestKey }).success,
    true,
  );
  assert.equal(adminCreditSchema.safeParse({ userId, amountCents: 25_000, reason: "no", requestKey }).success, false);
  assert.equal(adminCreditSchema.safeParse({ userId, amountCents: 25_000, reason: "   ", requestKey }).success, false);
  assert.equal(
    adminCreditSchema.safeParse({ userId, amountCents: 25_000, reason, requestKey: "nope" }).success,
    false,
  );

  const missing = emptyStore();
  const denied = creditWalletInStore(missing, {
    adminId,
    adminEmail,
    userId,
    amountCents: 25_000,
    reason,
    requestKey,
  });
  assert.equal(denied.ok, false);
  assert.equal(missing.ledgerEntries.length, 0);
  assert.equal(missing.auditLog.length, 0);
});

test("the same admin credit key rejects a different user, amount, or admin", () => {
  const requestKey = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const otherUserId = "99999999-9999-4999-8999-999999999999";
  const otherAdminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const reason = "EFT received 14 Oct";
  const store = emptyStore();
  store.profiles.push(profile(userId, "brand@fweta.test"), profile(otherUserId, "other@fweta.test"));
  store.wallets.push(
    { userId, availableCents: 0, pendingCents: 0, updatedAt: at },
    { userId: otherUserId, availableCents: 0, pendingCents: 0, updatedAt: at },
  );

  const first = creditWalletInStore(store, {
    adminId,
    adminEmail,
    userId,
    amountCents: 25_000,
    reason,
    requestKey,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const credited = structuredClone(store);

  const mismatches = [
    {
      label: "user",
      input: { adminId, adminEmail, userId: otherUserId, amountCents: 25_000, reason, requestKey },
    },
    {
      label: "amount",
      input: { adminId, adminEmail, userId, amountCents: 26_000, reason, requestKey },
    },
    {
      label: "admin",
      input: {
        adminId: otherAdminId,
        adminEmail: "other-admin@fweta.test",
        userId,
        amountCents: 25_000,
        reason,
        requestKey,
      },
    },
  ];

  for (const mismatch of mismatches) {
    const result = creditWalletInStore(store, mismatch.input);
    assert.deepEqual(
      result,
      { ok: false, error: "This request key was already used for a different credit." },
      mismatch.label,
    );
    assert.deepEqual(store, credited, mismatch.label);
  }

  const same = creditWalletInStore(store, {
    adminId,
    adminEmail,
    userId,
    amountCents: 25_000,
    reason,
    requestKey,
  });
  assert.deepEqual(same, first);
  assert.deepEqual(store, credited);
});

test("an admin credit key matches in either case and still rejects a different credit", () => {
  const requestKey = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const upperKey = requestKey.toUpperCase();
  const otherUserId = "99999999-9999-4999-8999-999999999999";
  const otherAdminId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const reason = "EFT received 14 Oct";
  const store = emptyStore();
  store.profiles.push(profile(userId, "brand@fweta.test"), profile(otherUserId, "other@fweta.test"));
  store.wallets.push(
    { userId, availableCents: 0, pendingCents: 0, updatedAt: at },
    { userId: otherUserId, availableCents: 0, pendingCents: 0, updatedAt: at },
  );

  assert.equal(adminCreditSchema.safeParse({ userId, amountCents: 25_000, reason, requestKey: upperKey }).success, true);
  assert.equal(
    adminCreditSchema.safeParse({ userId, amountCents: 25_000, reason, requestKey: "not-a-uuid" }).success,
    false,
  );

  const first = creditWalletInStore(store, {
    adminId,
    adminEmail,
    userId,
    amountCents: 25_000,
    reason,
    requestKey: upperKey,
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(store.ledgerEntries.length, 1);
  assert.equal(store.ledgerEntries[0]?.requestKey, requestKey);

  const again = creditWalletInStore(store, {
    adminId,
    adminEmail,
    userId,
    amountCents: 25_000,
    reason,
    requestKey,
  });
  assert.deepEqual(again, first);
  assert.equal(store.ledgerEntries.length, 1);
  assert.equal(store.auditLog.filter((row) => row.action === "wallet.admin_credit").length, 1);
  const credited = structuredClone(store);

  const mismatches = [
    {
      label: "user",
      input: { adminId, adminEmail, userId: otherUserId, amountCents: 25_000, reason, requestKey: upperKey },
    },
    {
      label: "amount",
      input: { adminId, adminEmail, userId, amountCents: 26_000, reason, requestKey: upperKey },
    },
    {
      label: "admin",
      input: {
        adminId: otherAdminId,
        adminEmail: "other-admin@fweta.test",
        userId,
        amountCents: 25_000,
        reason,
        requestKey: upperKey,
      },
    },
  ];
  for (const mismatch of mismatches) {
    const result = creditWalletInStore(store, mismatch.input);
    assert.deepEqual(
      result,
      { ok: false, error: "This request key was already used for a different credit." },
      mismatch.label,
    );
    assert.deepEqual(store, credited, mismatch.label);
  }
});

test("money actions decide the transition inside the write", () => {
  const wallet = readFileSync(new URL("../../app/actions/wallet.ts", import.meta.url), "utf8");
  const paidStart = wallet.indexOf("export async function markWithdrawalPaidAction");
  const rejectStart = wallet.indexOf("export async function rejectWithdrawalAction");
  const depositStart = wallet.indexOf("export async function brandDepositAction");
  const paid = wallet.slice(paidStart, rejectStart);
  const rejected = wallet.slice(rejectStart, depositStart);
  assert.match(paid, /updateStore\(\(store\) => \{[\s\S]*markWithdrawalPaidInStore/);
  assert.equal(paid.includes("readStore("), false);
  assert.equal(paid.includes("status !== \"pending\""), false);
  assert.match(rejected, /updateStore\(\(store\) => \{[\s\S]*rejectWithdrawalInStore/);
  assert.equal(rejected.includes("readStore("), false);

  const creditStart = wallet.indexOf("export async function adminCreditWalletAction");
  const creditEnd = wallet.indexOf("export async function savePayoutMethodAction");
  const credit = wallet.slice(creditStart, creditEnd);
  assert.match(credit, /adminCreditSchema.safeParse/);
  assert.match(credit, /updateStore\(\(store\) => \{[\s\S]*creditWalletInStore/);

  const bookings = readFileSync(new URL("../../app/actions/bookings.ts", import.meta.url), "utf8");
  const respondStart = bookings.indexOf("export async function respondBookingAction");
  const deliverStart = bookings.indexOf("export async function deliverBookingAction");
  const respond = bookings.slice(respondStart, deliverStart);
  assert.match(respond, /updateStore\(\(s\) => \{[\s\S]*refundRequestedBooking/);
  assert.match(respond, /acceptRequestedBooking/);
  assert.equal(respond.includes("readStore("), false);
});
