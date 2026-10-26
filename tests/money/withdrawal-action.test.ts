import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import test, { after, mock } from "node:test";

import type { DatabaseStore, Profile, WithdrawalRequest } from "../../lib/db/types";

const dataDir = mkdtempSync(`${tmpdir()}/fweta-withdrawal-`);
process.env.FWETA_DATA_DIR = dataDir;
process.env.FWETA_STORE = "file";

const userId = "22222222-2222-4222-8222-222222222222";
const adminId = "11111111-1111-4111-8111-111111111111";
const methodId = "77777777-7777-4777-8777-777777777777";
const withdrawalId = "55555555-5555-4555-8555-555555555555";
const at = "2026-10-25T12:00:00.000Z";

const clipper = {
  id: userId,
  email: "clipper@fweta.test",
  displayName: "Clipper",
  roles: ["clipper"],
  primaryRole: "clipper",
  credentialVersion: 0,
};

const admin = {
  id: adminId,
  email: "admin@fweta.test",
  displayName: "Admin",
  roles: ["admin"],
  primaryRole: "admin",
  credentialVersion: 0,
};

let activeSession: typeof clipper | typeof admin = clipper;

mock.module("next/cache", {
  namedExports: {
    revalidatePath() {},
  },
});

mock.module("@/lib/auth/session", {
  namedExports: {
    async requireSession() {
      return activeSession;
    },
    async getSession() {
      return activeSession;
    },
  },
});

let chain: Promise<void> = Promise.resolve();

function solo<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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

function setStore(store: DatabaseStore) {
  (globalThis as { __fwetaStore?: DatabaseStore }).__fwetaStore = structuredClone(store);
}

after(() => {
  (globalThis as { __fwetaStore?: DatabaseStore }).__fwetaStore = undefined;
  delete process.env.FWETA_DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
});

test("requestWithdrawalAction refuses an unverified account with no balance change", async () => {
  await solo(async () => {
    activeSession = clipper;
    const wallet = await import("../../app/actions/wallet");
    const { readStore } = await import("../../lib/db/store");
    const store = emptyStore();
    const owner = profile(userId, clipper.email);
    owner.kyc = {
      legalName: "Kai Nangolo",
      idNumberEnc: "encrypted-id",
      country: "NA",
      submittedAt: at,
      documentPath: "id-photo.png",
      status: "pending",
    };
    store.profiles.push(owner);
    store.wallets.push({ userId, availableCents: 50_000, pendingCents: 0, updatedAt: at });
    store.payoutMethods.push({
      id: methodId,
      userId,
      bankName: "Test Bank",
      branchCode: "000000",
      accountNumberEnc: "encrypted-account",
      accountHolderName: "Kai Nangolo",
      accountType: "cheque",
      createdAt: at,
      updatedAt: at,
    });
    setStore(store);

    const result = await wallet.requestWithdrawalAction({
      amountCents: 10_000,
      payoutMethodId: methodId,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "Payout stays closed until an admin verifies the ID photo.");
    }
    const after = await readStore();
    assert.equal(after.withdrawalRequests.length, 0);
    assert.equal(after.ledgerEntries.length, 0);
    assert.equal(after.wallets.find((row) => row.userId === userId)?.availableCents, 50_000);
    assert.equal(after.wallets.find((row) => row.userId === userId)?.pendingCents, 0);
  });
});

test("concurrent mark-paid calls against the store debit once, then a later call does not", async () => {
  await solo(async () => {
    activeSession = admin;
    const wallet = await import("../../app/actions/wallet");
    const { readStore } = await import("../../lib/db/store");
    const store = emptyStore();
    store.profiles.push(profile(userId, "clipper@fweta.test"));
    store.wallets.push({ userId, availableCents: 0, pendingCents: 15_000, updatedAt: at });
    const request: WithdrawalRequest = {
      id: withdrawalId,
      userId,
      payoutMethodId: methodId,
      amountCents: 15_000,
      status: "pending",
      bankReference: null,
      adminNote: null,
      createdAt: at,
      updatedAt: at,
      paidAt: null,
    };
    store.withdrawalRequests.push(request);
    setStore(store);

    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () => wallet.markWithdrawalPaidAction(withdrawalId, "BATCH")),
    );
    const sequential = await wallet.markWithdrawalPaidAction(withdrawalId, "LATER");

    assert.equal(concurrent.filter((result) => result.ok).length, 1);
    assert.equal(
      concurrent.filter((result) => !result.ok && result.error === "Already processed.").length,
      5,
    );
    assert.equal(sequential.ok, false);
    if (!sequential.ok) assert.equal(sequential.error, "Already processed.");

    const after = await readStore();
    const paid = after.ledgerEntries.filter((row) => row.reason === "Withdrawal paid via EFT");
    assert.equal(after.ledgerEntries.length, 1);
    assert.equal(paid.length, 1);
    assert.equal(paid[0]?.amountCents, 15_000);
    assert.equal(paid[0]?.referenceId, withdrawalId);
    const balance = after.wallets.find((row) => row.userId === userId);
    assert.equal(balance?.pendingCents, 0);
    assert.equal(balance?.availableCents, 0);
    assert.equal(after.withdrawalRequests[0]?.status, "paid");
    assert.equal(after.withdrawalRequests[0]?.bankReference, "BATCH");
  });
});

test("one admin credit request key credits once for a double submit and six concurrent submits", async () => {
  await solo(async () => {
    activeSession = admin;
    const wallet = await import("../../app/actions/wallet");
    const { readStore } = await import("../../lib/db/store");
    const requestKey = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const amountCents = 20_000;
    const reason = "EFT received 14 Oct";

    function seed() {
      const store = emptyStore();
      store.profiles.push(profile(userId, "brand@fweta.test"));
      store.wallets.push({ userId, availableCents: 0, pendingCents: 0, updatedAt: at });
      setStore(store);
    }

    function credit() {
      return wallet.adminCreditWalletAction(userId, amountCents, reason, requestKey);
    }

    seed();
    const first = await credit();
    const second = await credit();
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(second.entryId, first.entryId);
    assert.equal(second.availableCents, first.availableCents);
    assert.equal(first.availableCents, amountCents);

    let after = await readStore();
    assert.equal(after.ledgerEntries.length, 1);
    assert.equal(after.ledgerEntries[0]?.requestKey, requestKey);
    assert.equal(after.ledgerEntries[0]?.amountCents, amountCents);
    assert.equal(after.auditLog.filter((row) => row.action === "wallet.admin_credit").length, 1);
    assert.equal(after.wallets.find((row) => row.userId === userId)?.availableCents, amountCents);

    seed();
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => credit()));
    assert.equal(concurrent.filter((result) => result.ok).length, 6);
    const entryIds = new Set(concurrent.map((result) => (result.ok ? result.entryId : "")));
    assert.equal(entryIds.size, 1);
    after = await readStore();
    assert.equal(after.ledgerEntries.length, 1);
    assert.equal(after.ledgerEntries[0]?.requestKey, requestKey);
    assert.equal(after.auditLog.filter((row) => row.action === "wallet.admin_credit").length, 1);
    assert.equal(after.wallets.find((row) => row.userId === userId)?.availableCents, amountCents);
  });
});

test("a reused admin credit key returns the conflict to the form and credits nothing", async () => {
  await solo(async () => {
    activeSession = admin;
    const wallet = await import("../../app/actions/wallet");
    const { readStore } = await import("../../lib/db/store");
    const requestKey = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const otherUserId = "99999999-9999-4999-8999-999999999999";
    const otherAdmin = {
      ...admin,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "other-admin@fweta.test",
    };
    const amountCents = 20_000;
    const reason = "EFT received 14 Oct";
    const conflict = {
      ok: false as const,
      error: "This request key was already used for a different credit.",
    };

    const store = emptyStore();
    store.profiles.push(profile(userId, "brand@fweta.test"), profile(otherUserId, "other@fweta.test"));
    store.wallets.push(
      { userId, availableCents: 0, pendingCents: 0, updatedAt: at },
      { userId: otherUserId, availableCents: 0, pendingCents: 0, updatedAt: at },
    );
    setStore(store);

    const first = await wallet.adminCreditWalletAction(userId, amountCents, reason, requestKey);
    assert.equal(first.ok, true);

    const mismatches = [
      { userId: otherUserId, amountCents, session: admin },
      { userId, amountCents: amountCents + 100, session: admin },
      { userId, amountCents, session: otherAdmin },
    ];
    for (const mismatch of mismatches) {
      activeSession = mismatch.session;
      const result = await wallet.adminCreditWalletAction(mismatch.userId, mismatch.amountCents, reason, requestKey);
      assert.deepEqual(result, conflict);
    }

    const after = await readStore();
    assert.equal(after.ledgerEntries.length, 1);
    assert.equal(after.ledgerEntries[0]?.requestKey, requestKey);
    assert.equal(after.wallets.find((row) => row.userId === userId)?.availableCents, amountCents);
    assert.equal(after.wallets.find((row) => row.userId === otherUserId)?.availableCents, 0);
    assert.equal(after.auditLog.filter((row) => row.action === "wallet.admin_credit").length, 1);

    activeSession = admin;
    const same = await wallet.adminCreditWalletAction(userId, amountCents, reason, requestKey);
    assert.equal(same.ok, true);
    if (same.ok && first.ok) assert.equal(same.entryId, first.entryId);
  });
});

test("an admin credit key in another case returns the first result and still rejects a mismatch", async () => {
  await solo(async () => {
    activeSession = admin;
    const wallet = await import("../../app/actions/wallet");
    const { readStore } = await import("../../lib/db/store");
    const requestKey = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const upperKey = requestKey.toUpperCase();
    const otherUserId = "99999999-9999-4999-8999-999999999999";
    const otherAdmin = {
      ...admin,
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "other-admin@fweta.test",
    };
    const amountCents = 20_000;
    const reason = "EFT received 14 Oct";
    const conflict = {
      ok: false as const,
      error: "This request key was already used for a different credit.",
    };

    const store = emptyStore();
    store.profiles.push(profile(userId, "brand@fweta.test"), profile(otherUserId, "other@fweta.test"));
    store.wallets.push(
      { userId, availableCents: 0, pendingCents: 0, updatedAt: at },
      { userId: otherUserId, availableCents: 0, pendingCents: 0, updatedAt: at },
    );
    setStore(store);

    const first = await wallet.adminCreditWalletAction(userId, amountCents, reason, upperKey);
    const second = await wallet.adminCreditWalletAction(userId, amountCents, reason, requestKey);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(second.entryId, first.entryId);
    assert.equal(second.availableCents, first.availableCents);

    let after = await readStore();
    assert.equal(after.ledgerEntries.length, 1);
    assert.equal(after.ledgerEntries[0]?.requestKey, requestKey);
    assert.equal(after.wallets.find((row) => row.userId === userId)?.availableCents, amountCents);
    assert.equal(after.auditLog.filter((row) => row.action === "wallet.admin_credit").length, 1);

    const mismatches = [
      { userId: otherUserId, amountCents, session: admin },
      { userId, amountCents: amountCents + 100, session: admin },
      { userId, amountCents, session: otherAdmin },
    ];
    for (const mismatch of mismatches) {
      activeSession = mismatch.session;
      const result = await wallet.adminCreditWalletAction(mismatch.userId, mismatch.amountCents, reason, upperKey);
      assert.deepEqual(result, conflict);
    }

    after = await readStore();
    assert.equal(after.ledgerEntries.length, 1);
    assert.equal(after.ledgerEntries[0]?.requestKey, requestKey);
    assert.equal(after.wallets.find((row) => row.userId === userId)?.availableCents, amountCents);
    assert.equal(after.wallets.find((row) => row.userId === otherUserId)?.availableCents, 0);
    assert.equal(after.auditLog.filter((row) => row.action === "wallet.admin_credit").length, 1);
  });
});
