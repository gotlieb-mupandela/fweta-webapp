import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { BrandDeposit, DatabaseStore, Wallet } from "../../lib/db/types";
import { brandDepositFileSchema } from "../../lib/validations/accounts";
import {
  confirmPendingPayIn,
  payInRowView,
  rejectPendingPayIn,
} from "../../lib/wallet/brand-deposit";

const brand = "11111111-1111-4111-8111-111111111111";
const admin = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-25T12:00:00.000Z";
const amountCents = 250050;

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

function wallet(availableCents: number): Wallet {
  return {
    userId: brand,
    availableCents,
    pendingCents: 0,
    updatedAt: now,
  };
}

function deposit(partial: Partial<BrandDeposit> = {}): BrandDeposit {
  return {
    id: "dep-1",
    brandId: brand,
    amountCents,
    note: "Manual EFT deposit",
    status: "pending",
    bankReference: "FWETA-1842",
    confirmedBy: null,
    confirmedAt: null,
    createdAt: now,
    ...partial,
  };
}

function readyStore(partial: Partial<BrandDeposit> = {}, availableCents = 5000) {
  const store = emptyStore();
  store.wallets.push(wallet(availableCents));
  store.brandDeposits.push(deposit(partial));
  return store;
}

const adminActor = {
  depositId: "dep-1",
  actorId: admin,
  actorRoles: ["admin"] as const,
  now,
};

function referenceError(value: unknown) {
  const parsed = brandDepositFileSchema.safeParse({ bankReference: value });
  assert.equal(parsed.success, false);
  if (parsed.success) throw new Error("expected a reference error");
  return parsed.error.issues[0]?.message ?? "";
}

test("a missing or too short bank reference is refused", () => {
  assert.equal(referenceError(undefined), "Enter the bank reference from your EFT.");
  assert.equal(referenceError(null), "Enter the bank reference from your EFT.");
  assert.equal(referenceError(""), "Enter the bank reference from your EFT.");
  assert.equal(referenceError("   "), "Enter the bank reference from your EFT.");
  assert.equal(referenceError("ab"), "Bank reference must be 4 to 64 characters.");
  assert.equal(referenceError("  ab  "), "Bank reference must be 4 to 64 characters.");
  assert.equal(referenceError("A".repeat(65)), "Bank reference must be 4 to 64 characters.");
  assert.equal(
    referenceError("AB_12"),
    "Bank reference can use letters, digits, spaces, hyphens, and slashes.",
  );

  const parsed = brandDepositFileSchema.safeParse({ bankReference: "  AB-12/3  " });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.bankReference, "AB-12/3");
});

test("confirm after reject is refused and the wallet amount stays put", () => {
  const store = readyStore();
  rejectPendingPayIn(store, { ...adminActor, note: "No matching transfer" });
  const rejected = store.brandDeposits[0];
  assert.equal(rejected?.status, "rejected");
  assert.equal(rejected?.amountCents, amountCents);
  assert.equal(store.wallets[0]?.availableCents, 5000);
  assert.equal(store.ledgerEntries.length, 0);

  assert.throws(
    () => confirmPendingPayIn(store, { ...adminActor, reason: "Brand pay-in confirmed" }),
    (err: unknown) => err instanceof Error && err.message === "This pay-in was rejected.",
  );
  assert.equal(store.brandDeposits[0]?.status, "rejected");
  assert.equal(store.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(store.wallets[0]?.availableCents, 5000);
  assert.equal(store.ledgerEntries.length, 0);
});

test("a cancelled or expired pay-in is refused with no ledger row", () => {
  for (const status of ["cancelled", "expired"] as const) {
    const store = readyStore({ status });
    const expected =
      status === "cancelled" ? "This pay-in was cancelled." : "This pay-in has expired.";
    assert.throws(
      () => confirmPendingPayIn(store, { ...adminActor, reason: "Brand pay-in confirmed" }),
      (err: unknown) => err instanceof Error && err.message === expected,
    );
    assert.throws(
      () => rejectPendingPayIn(store, adminActor),
      (err: unknown) => err instanceof Error && err.message === expected,
    );
    assert.equal(store.brandDeposits[0]?.status, status);
    assert.equal(store.brandDeposits[0]?.amountCents, amountCents);
    assert.equal(store.wallets[0]?.availableCents, 5000);
    assert.equal(store.ledgerEntries.length, 0);
  }
});

test("confirming twice credits the wallet once", async () => {
  const store = readyStore();
  let tail: Promise<void> = Promise.resolve();
  const update = (mutator: (draft: DatabaseStore) => void) => {
    const run = tail.catch(() => undefined).then(async () => {
      const draft = structuredClone(store);
      mutator(draft);
      store.brandDeposits = draft.brandDeposits;
      store.wallets = draft.wallets;
      store.ledgerEntries = draft.ledgerEntries;
    });
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
  const credit = (draft: DatabaseStore) => {
    confirmPendingPayIn(draft, { ...adminActor, reason: "Brand pay-in confirmed" });
  };

  const errors: string[] = [];
  await Promise.all([
    update(credit).catch((err: unknown) => {
      errors.push(err instanceof Error ? err.message : "failed");
    }),
    update(credit).catch((err: unknown) => {
      errors.push(err instanceof Error ? err.message : "failed");
    }),
  ]);

  assert.deepEqual(errors, ["This pay-in is already credited."]);
  assert.equal(store.brandDeposits[0]?.status, "credited");
  assert.equal(store.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(store.wallets[0]?.availableCents, 5000 + amountCents);
  assert.equal(store.ledgerEntries.length, 1);
  assert.equal(store.ledgerEntries[0]?.amountCents, amountCents);
  assert.equal(store.ledgerEntries[0]?.referenceType, "brand_deposit");

  assert.throws(
    () => confirmPendingPayIn(store, { ...adminActor, reason: "Brand pay-in confirmed" }),
    (err: unknown) => err instanceof Error && err.message === "This pay-in is already credited.",
  );
  assert.equal(store.wallets[0]?.availableCents, 5000 + amountCents);
  assert.equal(store.ledgerEntries.length, 1);
});

test("a non-admin cannot confirm or reject a pay-in", () => {
  const store = readyStore();
  const actor = { ...adminActor, actorRoles: ["brand"] as const };
  assert.throws(
    () => confirmPendingPayIn(store, { ...actor, reason: "Brand pay-in confirmed" }),
    (err: unknown) => err instanceof Error && err.message === "Admin only.",
  );
  assert.throws(
    () => rejectPendingPayIn(store, actor),
    (err: unknown) => err instanceof Error && err.message === "Admin only.",
  );
  assert.equal(store.brandDeposits[0]?.status, "pending");
  assert.equal(store.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(store.wallets[0]?.availableCents, 5000);
  assert.equal(store.ledgerEntries.length, 0);
});

test("an older pay-in without a reference still displays and can be confirmed", () => {
  const legacy = deposit({ bankReference: null, note: "EFT on file", amountCents: 100000 });
  const view = payInRowView(legacy);
  assert.equal(view.reference, null);
  assert.equal(view.amountCents, 100000);
  assert.equal(view.note, "EFT on file");
  assert.equal(view.statusLabel, "Waiting");
  assert.equal(payInRowView({ ...legacy, bankReference: "   " }).reference, null);
  assert.equal(payInRowView({ ...legacy, status: "credited" }).statusLabel, "Confirmed");

  const store = readyStore({ bankReference: null }, 0);
  confirmPendingPayIn(store, { ...adminActor, bankReference: "   ", reason: "Brand pay-in confirmed" });
  assert.equal(store.brandDeposits[0]?.status, "credited");
  assert.equal(store.brandDeposits[0]?.bankReference, null);
  assert.equal(store.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(store.wallets[0]?.availableCents, amountCents);
  assert.equal(store.ledgerEntries.length, 1);
});

test("filing and crediting keep the deposit amount and run inside the store write", () => {
  const walletSrc = readFileSync(new URL("../../app/actions/wallet.ts", import.meta.url), "utf8");
  const payinSrc = readFileSync(new URL("../../app/actions/payin.ts", import.meta.url), "utf8");
  const helperSrc = readFileSync(new URL("../../lib/wallet/brand-deposit.ts", import.meta.url), "utf8");
  const formSrc = readFileSync(
    new URL("../../components/forms/brand-deposit-form.tsx", import.meta.url),
    "utf8",
  );
  const payinsPage = readFileSync(
    new URL("../../app/dashboard/admin/payins/page.tsx", import.meta.url),
    "utf8",
  );

  const fileAction = walletSrc.slice(
    walletSrc.indexOf("export async function brandDepositAction"),
    walletSrc.indexOf("export async function confirmBrandDepositAction"),
  );
  const confirmAction = walletSrc.slice(
    walletSrc.indexOf("export async function confirmBrandDepositAction"),
    walletSrc.indexOf("export async function rejectBrandDepositAction"),
  );
  const rejectAction = walletSrc.slice(
    walletSrc.indexOf("export async function rejectBrandDepositAction"),
    walletSrc.indexOf("export async function currentUserId"),
  );
  const confirmPayIn = payinSrc.slice(payinSrc.indexOf("export async function confirmPayInAction"));

  assert.match(fileAction, /nadToCents\(amountCents \/ 100\)/);
  assert.match(fileAction, /cents !== amountCents/);
  assert.match(fileAction, /brandDepositFileSchema\.safeParse\(\{ bankReference \}\)/);
  assert.match(fileAction, /amountCents: cents/);
  assert.match(fileAction, /bankReference: parsed\.data\.bankReference/);

  for (const body of [confirmAction, confirmPayIn]) {
    const updateAt = body.indexOf("updateStore");
    const creditAt = body.indexOf("confirmPendingPayIn");
    assert.ok(updateAt !== -1 && creditAt > updateAt);
    assert.equal(body.includes("applyWalletDelta"), false);
  }
  const rejectUpdateAt = rejectAction.indexOf("updateStore");
  const rejectAt = rejectAction.indexOf("rejectPendingPayIn");
  assert.ok(rejectUpdateAt !== -1 && rejectAt > rejectUpdateAt);

  const confirmHelper = helperSrc.slice(helperSrc.indexOf("export function confirmPendingPayIn"));
  const statusAt = confirmHelper.indexOf("payInConfirmError(row.status)");
  const ledgerAt = confirmHelper.indexOf("applyWalletDelta(store");
  assert.ok(statusAt !== -1 && ledgerAt > statusAt);
  assert.match(formSrc, /name="bankReference"/);
  assert.match(formSrc, /required/);
  assert.match(formSrc, /setError\(res\.error\)/);
  assert.match(payinsPage, /payInRowView\(deposit\)/);
  assert.match(payinsPage, /view\.reference \?/);

  const accountsSrc = readFileSync(new URL("../../lib/validations/accounts.ts", import.meta.url), "utf8");
  const referenceSchema = accountsSrc.slice(accountsSrc.indexOf("export const bankReferenceSchema"));
  for (const src of [fileAction, confirmAction, rejectAction, confirmPayIn, helperSrc, formSrc, payinsPage, referenceSchema]) {
    assert.equal(src.includes("\u2014"), false);
    assert.equal(src.includes("\u2013"), false);
  }
});
