import assert from "node:assert/strict";
import test from "node:test";

import {
  applySavedProfile,
  idleSaveFeedback,
  reduceSaveFeedback,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_TIMEOUT_MS,
  SaveTimeoutError,
  withSaveTimeout,
} from "@/lib/forms/save-feedback";
import { payoutMethodForUser } from "@/lib/settings/payout-record";
import { withdrawGate, withdrawGateMessage } from "@/lib/settings/withdraw-gate";
import { payoutFieldErrors, payoutMethodSchema } from "@/lib/validations/payout-method";

const validPayout = {
  bankName: "Bank Windhoek",
  branchCode: "461266",
  accountNumber: "12345678",
  accountHolderName: "Amara Nangolo",
  accountType: "cheque" as const,
};

test("payout schema reports every empty field and a 5 digit branch code", () => {
  const empty = payoutMethodSchema.safeParse({
    bankName: "",
    branchCode: "",
    accountNumber: "",
    accountHolderName: "",
    accountType: "cheque",
  });
  assert.equal(empty.success, false);
  if (empty.success) return;
  const errors = payoutFieldErrors(empty.error);
  assert.equal(errors.bankName, "Bank name is required.");
  assert.equal(errors.branchCode, "Branch code is required.");
  assert.equal(errors.accountNumber, "Account number is required.");
  assert.equal(errors.accountHolderName, "Account holder name is required.");
  assert.equal(errors.accountType, undefined);

  const fiveDigits = payoutMethodSchema.safeParse({ ...validPayout, branchCode: "12345" });
  assert.equal(fiveDigits.success, false);
  if (fiveDigits.success) return;
  assert.equal(payoutFieldErrors(fiveDigits.error).branchCode, "Branch code must be 6 digits.");

  const shortAccount = payoutMethodSchema.safeParse({ ...validPayout, accountNumber: "1234567" });
  assert.equal(shortAccount.success, false);
  if (shortAccount.success) return;
  assert.equal(
    payoutFieldErrors(shortAccount.error).accountNumber,
    "Account number must be at least 8 characters.",
  );

  const longAccount = payoutMethodSchema.safeParse({
    ...validPayout,
    accountNumber: "123456789012345678901",
  });
  assert.equal(longAccount.success, false);
  if (longAccount.success) return;
  assert.equal(
    payoutFieldErrors(longAccount.error).accountNumber,
    "Account number must be at most 20 characters.",
  );

  const badType = payoutMethodSchema.safeParse({ ...validPayout, accountType: "current" });
  assert.equal(badType.success, false);
  if (badType.success) return;
  assert.ok(payoutFieldErrors(badType.error).accountType);
});

test("payout schema accepts a 6 digit branch code", () => {
  const parsed = payoutMethodSchema.safeParse(validPayout);
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.branchCode, "461266");
});

test("profile save feedback clears pending and keeps a timeout draft", () => {
  const started = reduceSaveFeedback(
    { pending: false, error: "Old error", success: "Old success" },
    { type: "start" },
  );
  assert.deepEqual(started, { pending: true, error: null, success: null });

  const saved = applySavedProfile({ displayName: "New Name", bio: "New bio" });
  const done = reduceSaveFeedback(started, { type: "success", message: "Profile saved." });
  assert.equal(done.pending, false);
  assert.equal(done.error, null);
  assert.equal(done.success, "Profile saved.");
  assert.equal(saved.displayName, "New Name");
  assert.equal(saved.bio, "New bio");

  const typed = { displayName: "Typed name", bio: "Still here" };
  const timedOut = reduceSaveFeedback(started, { type: "timeout" });
  assert.equal(timedOut.pending, false);
  assert.equal(timedOut.success, null);
  assert.equal(timedOut.error, SAVE_TIMEOUT_MESSAGE);
  assert.equal(typed.displayName, "Typed name");
  assert.equal(typed.bio, "Still here");
  assert.equal(SAVE_TIMEOUT_MS, 25_000);
  assert.deepEqual(idleSaveFeedback, { pending: false, error: null, success: null });
});

test("withSaveTimeout settles a fast save and rejects a slow one", async () => {
  assert.equal(await withSaveTimeout(Promise.resolve("saved"), 50), "saved");
  await assert.rejects(
    () => withSaveTimeout(new Promise((resolve) => setTimeout(() => resolve("late"), 80)), 15),
    (err: unknown) => err instanceof SaveTimeoutError && err.message === SAVE_TIMEOUT_MESSAGE,
  );
});

test("withdraw amount stays closed until a payout method exists and identity is verified", () => {
  const methods = [{ userId: "creator-1", id: "pm-1" }];
  assert.equal(payoutMethodForUser(methods, "creator-1")?.id, "pm-1");
  assert.equal(payoutMethodForUser(methods, "someone-else"), null);

  const missing = withdrawGate({
    hasPayoutMethod: false,
    identityReady: true,
    kyc: { status: "verified", documentOnFile: true },
  });
  assert.equal(missing.kind, "missing_payout");
  if (missing.kind !== "missing_payout") return;
  const missingCopy = withdrawGateMessage(missing);
  assert.match(missingCopy.body, /no bank details/i);
  assert.equal(missingCopy.href, "/dashboard/settings/payout");
  assert.doesNotMatch(missingCopy.title, /verified/i);

  const pending = withdrawGate({
    hasPayoutMethod: true,
    identityReady: false,
    kyc: { status: "pending", documentOnFile: true },
  });
  assert.equal(pending.kind, "awaiting_review");
  if (pending.kind !== "awaiting_review") return;
  const pendingCopy = withdrawGateMessage(pending);
  assert.match(pendingCopy.body, /payout method is saved/i);
  assert.match(pendingCopy.body, /verify the ID photo/i);
  assert.equal(pendingCopy.href, "#identity");
  assert.doesNotMatch(pendingCopy.title, /payout method saved/i);

  assert.equal(
    withdrawGate({ hasPayoutMethod: true, identityReady: false, kyc: null }).kind,
    "need_identity",
  );
  assert.equal(
    withdrawGate({
      hasPayoutMethod: true,
      identityReady: false,
      kyc: { status: "verified", documentOnFile: false },
    }).kind,
    "need_identity",
  );
  assert.equal(
    withdrawGate({
      hasPayoutMethod: true,
      identityReady: true,
      kyc: { status: "verified", documentOnFile: true },
    }).kind,
    "ready",
  );
});
