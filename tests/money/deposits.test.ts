import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { BrandDeposit, DatabaseStore, Wallet } from "../../lib/db/types";
import { brandDepositFileSchema, payInRequestSchema } from "../../lib/validations/accounts";
import {
  OTHER_BRAND_REFERENCE_WARNING,
  confirmPendingPayIn,
  fileManualPayIn,
  payInRowView,
  rejectPendingPayIn,
} from "../../lib/wallet/brand-deposit";

const brand = "11111111-1111-4111-8111-111111111111";
const otherBrand = "33333333-3333-4333-8333-333333333333";
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

  for (const value of ["=ABCD", "+ABCD", "-ABCD", "@ABCD", "  -ABCD  "]) {
    assert.equal(referenceError(value), "Bank reference cannot start with =, +, - or @.");
  }
  assert.equal(referenceError("AB\nCD12"), "Bank reference cannot contain a line break.");
  assert.equal(referenceError("AB\rCD12"), "Bank reference cannot contain a line break.");
  const hyphen = brandDepositFileSchema.safeParse({ bankReference: "FWETA-1842" });
  assert.equal(hyphen.success, true);
  if (hyphen.success) assert.equal(hyphen.data.bankReference, "FWETA-1842");
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

function filing(id: string, bankReference: string) {
  return {
    id,
    brandId: brand,
    amountCents: 10000,
    note: "Manual EFT pay-in",
    bankReference,
    createdAt: now,
  };
}

test("a pay-in request with no reference or an invalid one saves nothing", () => {
  const store = emptyStore();
  const missing = payInRequestSchema.safeParse({ amountCents: 10000 });
  assert.equal(missing.success, false);
  for (const reference of ["", "   ", "ab", "=ABCD", "+ABCD", "-ABCD", "@ABCD", "AB\nCD12", "AB\rCD12"]) {
    const parsed = payInRequestSchema.safeParse({ amountCents: 10000, bankReference: reference });
    assert.equal(parsed.success, false);
    const filed = fileManualPayIn(store, filing(`bad-${reference.length}`, reference));
    assert.equal(filed.ok, false);
  }
  assert.equal(store.brandDeposits.length, 0);
  assert.equal(store.ledgerEntries.length, 0);
  assert.equal(store.wallets.length, 0);
});

test("separator-only and too-short references are refused when filing and confirming", () => {
  const required = "Enter the bank reference from your EFT.";
  const refused = ["////", "/ / /", "ABC", "AB/C"] as const;
  const messageFor = (reference: string) =>
    reference === "ABC" ? "Bank reference must be 4 to 64 characters." : required;

  const store = emptyStore();
  for (const reference of refused) {
    const filed = fileManualPayIn(store, filing(`bad-${refused.indexOf(reference)}`, reference));
    assert.equal(filed.ok, false);
    if (filed.ok) continue;
    assert.equal(filed.error, messageFor(reference));
  }
  assert.equal(store.brandDeposits.length, 0);
  assert.equal(store.ledgerEntries.length, 0);

  for (const reference of refused) {
    const pending = readyStore({ bankReference: null }, 0);
    assert.throws(
      () =>
        confirmPendingPayIn(pending, {
          ...adminActor,
          bankReference: reference,
          reason: "Brand pay-in confirmed",
        }),
      (err: unknown) => err instanceof Error && err.message === messageFor(reference),
    );
    assert.equal(pending.brandDeposits[0]?.status, "pending");
    assert.equal(pending.brandDeposits[0]?.bankReference, null);
    assert.equal(pending.brandDeposits[0]?.amountCents, amountCents);
    assert.equal(pending.wallets[0]?.availableCents, 0);
    assert.equal(pending.ledgerEntries.length, 0);
  }

  const saved = fileManualPayIn(store, filing("dep-ok", "ABC123"));
  assert.equal(saved.ok, true);
  assert.equal(store.brandDeposits.length, 1);
  assert.equal(store.brandDeposits[0]?.bankReference, "ABC123");
  assert.equal(store.brandDeposits[0]?.amountCents, 10000);
});

test("a duplicate reference is refused, except on a rejected pay-in", () => {
  const store = emptyStore();
  const first = fileManualPayIn(store, filing("dep-a", "  Ab-12  "));
  assert.equal(first.ok, true);
  assert.equal(store.brandDeposits[0]?.bankReference, "Ab-12");
  assert.equal(store.brandDeposits[0]?.amountCents, 10000);

  const duplicate = fileManualPayIn(store, filing("dep-b", "ab-12"));
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.error, "That bank reference is already used on another pay-in.");
  assert.equal(store.brandDeposits.length, 1);

  store.brandDeposits[0]!.status = "rejected";
  const afterReject = fileManualPayIn(store, filing("dep-c", "AB-12"));
  assert.equal(afterReject.ok, true);
  assert.equal(store.brandDeposits.length, 2);

  store.brandDeposits[1]!.status = "cancelled";
  const afterCancel = fileManualPayIn(store, filing("dep-d", "ab-12"));
  assert.equal(afterCancel.ok, false);
  assert.equal(store.brandDeposits.length, 2);
  assert.equal(store.brandDeposits[1]?.amountCents, 10000);
});

test("same-brand reference variants are refused", () => {
  const store = emptyStore();
  const first = fileManualPayIn(store, filing("dep-space", "ABC 123"));
  assert.equal(first.ok, true);
  assert.equal(store.brandDeposits[0]?.bankReference, "ABC 123");
  assert.equal(store.brandDeposits[0]?.amountCents, 10000);
  assert.notEqual(store.brandDeposits[0]?.referenceMatchesOtherBrand, true);

  for (const variant of ["ABC123", "ABC-123", "ABC/123"]) {
    const again = fileManualPayIn(store, filing(`dep-${variant}`, variant));
    assert.equal(again.ok, false);
    if (again.ok) continue;
    assert.equal(again.error, "That bank reference is already used on another pay-in.");
  }
  assert.equal(store.brandDeposits.length, 1);

  store.brandDeposits[0]!.status = "expired";
  const expired = fileManualPayIn(store, filing("dep-expired", "abc/123"));
  assert.equal(expired.ok, false);
  assert.equal(store.brandDeposits.length, 1);
  assert.equal(store.brandDeposits[0]?.amountCents, 10000);
});

test("another brand can reuse a reference and the pay-in is flagged", () => {
  const store = emptyStore();
  const theirs = fileManualPayIn(store, { ...filing("dep-other", "ABC-123"), brandId: otherBrand });
  assert.equal(theirs.ok, true);
  assert.equal(store.brandDeposits[0]?.bankReference, "ABC-123");
  assert.notEqual(store.brandDeposits[0]?.referenceMatchesOtherBrand, true);

  const saved = fileManualPayIn(store, filing("dep-ours", "  ABC/123  "));
  assert.equal(saved.ok, true);
  assert.equal(store.brandDeposits.length, 2);
  assert.equal(store.brandDeposits[1]?.bankReference, "ABC/123");
  assert.equal(store.brandDeposits[1]?.referenceMatchesOtherBrand, true);
  assert.equal(store.brandDeposits[1]?.amountCents, 10000);
  assert.equal(store.brandDeposits[1]?.brandId, brand);
});

test("the admin pay-ins page shows another brand's reference warning", () => {
  const flagged = payInRowView({
    amountCents: 10000,
    note: "Manual EFT pay-in",
    status: "pending",
    bankReference: "ABC/123",
    referenceMatchesOtherBrand: true,
  });
  assert.equal(flagged.reference, "ABC/123");
  assert.equal(flagged.otherBrandWarning, OTHER_BRAND_REFERENCE_WARNING);
  assert.equal(flagged.amountCents, 10000);

  const plain = payInRowView({
    amountCents: 10000,
    note: "Manual EFT pay-in",
    status: "pending",
    bankReference: "ABC/123",
  });
  assert.equal(plain.otherBrandWarning, null);

  const page = readFileSync(new URL("../../app/dashboard/admin/payins/page.tsx", import.meta.url), "utf8");
  assert.match(page, /view\.otherBrandWarning/);
  assert.match(page, /OTHER_BRAND_REFERENCE_WARNING|otherBrandWarning/);
  assert.match(page, /text-danger/);
});

test("a rejected pay-in reference can be used again by the same brand", () => {
  const store = emptyStore();
  const first = fileManualPayIn(store, filing("dep-old", "ABC-123"));
  assert.equal(first.ok, true);
  store.brandDeposits[0]!.status = "rejected";

  const reused = fileManualPayIn(store, filing("dep-new", "ABC 123"));
  assert.equal(reused.ok, true);
  assert.equal(store.brandDeposits.length, 2);
  assert.equal(store.brandDeposits[1]?.bankReference, "ABC 123");
  assert.equal(store.brandDeposits[1]?.amountCents, 10000);
  assert.notEqual(store.brandDeposits[1]?.referenceMatchesOtherBrand, true);
});

test("confirm keeps the brand reference and an admin cannot confirm their own pay-in", () => {
  const kept = readyStore({ bankReference: "  FWETA-1842  " });
  confirmPendingPayIn(kept, { ...adminActor, bankReference: "ADMIN-9999", reason: "Brand pay-in confirmed" });
  assert.equal(kept.brandDeposits[0]?.bankReference, "  FWETA-1842  ");
  assert.equal(kept.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(kept.wallets[0]?.availableCents, 5000 + amountCents);
  assert.equal(kept.ledgerEntries.length, 1);

  const filled = readyStore({ bankReference: null }, 0);
  confirmPendingPayIn(filled, { ...adminActor, bankReference: "  old-ref1  ", reason: "Brand pay-in confirmed" });
  assert.equal(filled.brandDeposits[0]?.bankReference, "old-ref1");
  assert.equal(filled.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(filled.ledgerEntries.length, 1);

  const invalid = readyStore({ bankReference: null }, 0);
  assert.throws(
    () => confirmPendingPayIn(invalid, { ...adminActor, bankReference: "-BAD12", reason: "Brand pay-in confirmed" }),
    (err: unknown) => err instanceof Error && err.message === "Bank reference cannot start with =, +, - or @.",
  );
  assert.equal(invalid.brandDeposits[0]?.status, "pending");
  assert.equal(invalid.brandDeposits[0]?.bankReference, null);
  assert.equal(invalid.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(invalid.wallets[0]?.availableCents, 0);
  assert.equal(invalid.ledgerEntries.length, 0);

  const taken = readyStore({ id: "dep-1", bankReference: null }, 0);
  taken.brandDeposits.push(deposit({ id: "dep-2", bankReference: "Taken-1", status: "credited" }));
  assert.throws(
    () => confirmPendingPayIn(taken, { ...adminActor, bankReference: "taken-1", reason: "Brand pay-in confirmed" }),
    (err: unknown) => err instanceof Error && err.message === "That bank reference is already used on another pay-in.",
  );
  assert.equal(taken.brandDeposits[0]?.status, "pending");
  assert.equal(taken.ledgerEntries.length, 0);
  assert.equal(taken.wallets[0]?.availableCents, 0);

  const own = readyStore();
  assert.throws(
    () => confirmPendingPayIn(own, { ...adminActor, actorId: brand, reason: "Brand pay-in confirmed" }),
    (err: unknown) => err instanceof Error && err.message === "You cannot confirm your own pay-in.",
  );
  assert.equal(own.brandDeposits[0]?.status, "pending");
  assert.equal(own.brandDeposits[0]?.bankReference, "FWETA-1842");
  assert.equal(own.brandDeposits[0]?.amountCents, amountCents);
  assert.equal(own.wallets[0]?.availableCents, 5000);
  assert.equal(own.ledgerEntries.length, 0);
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
  const requestAction = payinSrc.slice(
    payinSrc.indexOf("export async function requestPayInAction"),
    payinSrc.indexOf("export async function confirmPayInAction"),
  );
  const requestParse = requestAction.indexOf("payInRequestSchema.safeParse");
  const requestUpdate = requestAction.indexOf("updateStore");
  const requestFile = requestAction.indexOf("fileManualPayIn");
  assert.ok(requestParse !== -1 && requestParse < requestUpdate && requestFile > requestUpdate);
  assert.equal(requestAction.includes("bankReference: null"), false);
  const payinForm = readFileSync(
    new URL("../../components/onboarding/payin-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(payinForm, /name="bankReference"/);
  assert.match(payinForm, /required/);
  assert.match(payinForm, /setError\(res\.error\)/);

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
  const selfAt = confirmHelper.indexOf("input.actorId === row.brandId");
  const ledgerAt = confirmHelper.indexOf("applyWalletDelta(store");
  assert.ok(statusAt !== -1 && selfAt > statusAt && ledgerAt > selfAt);
  assert.match(helperSrc, /if \(existing\) return;/);
  assert.match(formSrc, /name="bankReference"/);
  assert.match(formSrc, /required/);
  assert.match(formSrc, /setError\(res\.error\)/);
  assert.match(payinsPage, /payInRowView\(deposit\)/);
  assert.match(payinsPage, /view\.reference \?/);

  const accountsSrc = readFileSync(new URL("../../lib/validations/accounts.ts", import.meta.url), "utf8");
  const referenceSchema = accountsSrc.slice(accountsSrc.indexOf("export const bankReferenceSchema"));
  for (const src of [fileAction, confirmAction, rejectAction, requestAction, confirmPayIn, helperSrc, formSrc, payinForm, payinsPage, referenceSchema]) {
    assert.equal(src.includes("\u2014"), false);
    assert.equal(src.includes("\u2013"), false);
  }
});
