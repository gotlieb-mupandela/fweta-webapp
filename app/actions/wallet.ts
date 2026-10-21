"use server";

import { revalidatePath } from "next/cache";

import { getSession, requireSession } from "@/lib/auth/session";
import {
  decryptSecret,
  encryptSecret,
  newId,
  nowIso,
  readStore,
  updateStore,
} from "@/lib/db/store";
import type { PayoutMethod, WithdrawalRequest } from "@/lib/db/types";
import { adjustWallet, applyWalletDelta, getWallet } from "@/lib/wallet/ledger";
import { payoutMethodSchema } from "@/lib/validations/payout-method";
import { kycSchema, withdrawalSchema } from "@/lib/validations/withdrawal";
import { nadToCents } from "@/lib/money/cents";
import { maskAccountNumber } from "@/lib/utils";

const MIN_WITHDRAWAL_CENTS = 10000; // N$100

export async function getMyWallet() {
  const session = await requireSession();
  return getWallet(session.id);
}

export async function getMyLedger() {
  const session = await requireSession();
  const store = await readStore();
  return store.ledgerEntries
    .filter((e) => e.userId === session.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function adminCreditWalletAction(userId: string, amountCents: number, reason: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const cents = nadToCents(amountCents / 100);
  if (cents == null || cents !== amountCents) {
    return { ok: false as const, error: "Enter a valid amount in NAD." };
  }

  const store = await readStore();
  const user = store.profiles.find((profile) => profile.id === userId);
  if (!user) return { ok: false as const, error: "User not found." };

  const note = reason.trim() || "Manual EFT credit";
  let availableCents = 0;
  let entryId = "";
  try {
    const result = await adjustWallet({
      userId,
      availableDelta: cents,
      type: "credit",
      reason: `${note} (confirmed by ${session.email})`,
      referenceType: "admin_credit",
    });
    availableCents = result.wallet.availableCents;
    entryId = result.entry.id;
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not credit wallet." };
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/users");
  revalidatePath(`/dashboard/admin/users/${userId}`);
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/brand/deposits");
  revalidatePath("/dashboard/settings/wallet");
  return { ok: true as const, availableCents, entryId };
}

export async function savePayoutMethodAction(raw: unknown) {
  const session = await requireSession();
  const parsed = payoutMethodSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid bank details." };

  const now = nowIso();
  await updateStore((s) => {
    const existing = s.payoutMethods.find((p) => p.userId === session.id);
    const enc = encryptSecret(parsed.data.accountNumber);
    if (existing) {
      existing.bankName = parsed.data.bankName;
      existing.branchCode = parsed.data.branchCode;
      existing.accountNumberEnc = enc;
      existing.accountHolderName = parsed.data.accountHolderName;
      existing.accountType = parsed.data.accountType;
      existing.updatedAt = now;
    } else {
      const method: PayoutMethod = {
        id: newId(),
        userId: session.id,
        bankName: parsed.data.bankName,
        branchCode: parsed.data.branchCode,
        accountNumberEnc: enc,
        accountHolderName: parsed.data.accountHolderName,
        accountType: parsed.data.accountType,
        createdAt: now,
        updatedAt: now,
      };
      s.payoutMethods.push(method);
    }
  });
  revalidatePath("/dashboard/settings/payout");
  revalidatePath("/dashboard/settings/withdraw");
  return { ok: true as const };
}

export async function getMyPayoutMethodMasked() {
  const session = await requireSession();
  const store = await readStore();
  const method = store.payoutMethods.find((p) => p.userId === session.id);
  if (!method) return null;
  let last4 = "****";
  try {
    last4 = maskAccountNumber(decryptSecret(method.accountNumberEnc));
  } catch {
    last4 = "****";
  }
  return {
    id: method.id,
    bankName: method.bankName,
    branchCode: method.branchCode,
    accountHolderName: method.accountHolderName,
    accountType: method.accountType,
    accountNumberMasked: last4,
  };
}

/** Admin-only: decrypt for EFT processing — never log. */
export async function getPayoutMethodForAdmin(userId: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return null;
  const store = await readStore();
  const method = store.payoutMethods.find((p) => p.userId === userId);
  if (!method) return null;
  try {
    return {
      ...method,
      accountNumber: decryptSecret(method.accountNumberEnc),
    };
  } catch {
    return null;
  }
}

export async function requestWithdrawalAction(raw: unknown) {
  const session = await requireSession();
  const parsed = withdrawalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid withdrawal." };
  if (parsed.data.amountCents < MIN_WITHDRAWAL_CENTS) {
    return { ok: false as const, error: "Minimum withdrawal is N$100." };
  }

  const store = await readStore();
  const method = store.payoutMethods.find(
    (p) => p.id === parsed.data.payoutMethodId && p.userId === session.id,
  );
  if (!method) return { ok: false as const, error: "Add a payout method first." };

  const req: WithdrawalRequest = {
    id: newId(),
    userId: session.id,
    payoutMethodId: method.id,
    amountCents: parsed.data.amountCents,
    status: "pending",
    bankReference: null,
    adminNote: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    paidAt: null,
  };

  // Atomic: wallet move + withdrawal record + ledger link in one write.
  try {
    await updateStore((s) => {
      const { entry } = applyWalletDelta(s, {
        userId: session.id,
        availableDelta: -parsed.data.amountCents,
        pendingDelta: parsed.data.amountCents,
        type: "debit",
        reason: "Withdrawal requested",
        referenceType: "withdrawal",
        referenceId: req.id,
      });
      entry.referenceId = req.id;
      s.withdrawalRequests.push(req);
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/settings/withdraw");
  revalidatePath("/dashboard/settings/wallet");
  revalidatePath("/dashboard/clipper/earnings");
  revalidatePath("/dashboard/admin/withdrawals");
  return { ok: true as const, id: req.id };
}

export async function listMyWithdrawals() {
  const session = await requireSession();
  const store = await readStore();
  return store.withdrawalRequests
    .filter((w) => w.userId === session.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPendingWithdrawalsAdmin() {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return [];
  const store = await readStore();
  return store.withdrawalRequests
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markWithdrawalPaidAction(
  id: string,
  bankReference?: string,
) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };

  const store = await readStore();
  const req = store.withdrawalRequests.find((w) => w.id === id);
  if (!req || req.status === "paid") return { ok: false as const, error: "Not found." };
  if (req.status !== "pending") return { ok: false as const, error: "Already handled." };

  try {
    await updateStore((s) => {
      applyWalletDelta(s, {
        userId: req.userId,
        availableDelta: 0,
        pendingDelta: -req.amountCents,
        type: "debit",
        reason: "Withdrawal paid via EFT",
        referenceType: "withdrawal",
        referenceId: req.id,
      });
      const w = s.withdrawalRequests.find((x) => x.id === id);
      if (!w) throw new Error("Withdrawal not found.");
      w.status = "paid";
      w.bankReference = bankReference || null;
      w.paidAt = nowIso();
      w.updatedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/admin/withdrawals");
  return { ok: true as const };
}

export async function rejectWithdrawalAction(id: string, note?: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const store = await readStore();
  const req = store.withdrawalRequests.find((w) => w.id === id);
  if (!req || req.status !== "pending") return { ok: false as const, error: "Not found." };

  try {
    await updateStore((s) => {
      applyWalletDelta(s, {
        userId: req.userId,
        availableDelta: req.amountCents,
        pendingDelta: -req.amountCents,
        type: "credit",
        reason: "Withdrawal rejected. Funds restored",
        referenceType: "withdrawal",
        referenceId: req.id,
      });
      const w = s.withdrawalRequests.find((x) => x.id === id);
      if (!w) throw new Error("Withdrawal not found.");
      w.status = "rejected";
      w.adminNote = note || null;
      w.updatedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/admin/withdrawals");
  return { ok: true as const };
}

export async function brandDepositAction(amountCents: number, note?: string) {
  const session = await requireSession();
  if (!session.roles.includes("brand")) return { ok: false as const, error: "Brand only." };
  const cents = nadToCents(amountCents / 100);
  if (cents == null || cents !== amountCents) {
    return { ok: false as const, error: "Enter a valid amount in NAD." };
  }

  const id = newId();
  try {
    await updateStore((s) => {
      s.brandDeposits.push({
        id,
        brandId: session.id,
        amountCents: cents,
        note: note?.trim() || "Manual EFT deposit",
        status: "pending",
        bankReference: null,
        confirmedBy: null,
        confirmedAt: null,
        createdAt: nowIso(),
      });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not submit the deposit." };
  }

  revalidatePath("/dashboard/brand/deposits");
  revalidatePath("/dashboard/admin/deposits");
  return { ok: true as const, id };
}

export async function confirmBrandDepositAction(id: string, bankReference?: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };

  const store = await readStore();
  const deposit = store.brandDeposits.find((item) => item.id === id);
  if (!deposit) return { ok: false as const, error: "Deposit not found." };
  if (deposit.status === "credited") return { ok: false as const, error: "This deposit is already credited." };
  if (deposit.status === "rejected") return { ok: false as const, error: "This deposit was rejected." };

  const reference = bankReference?.trim() || null;
  try {
    await updateStore((s) => {
      const row = s.brandDeposits.find((item) => item.id === id);
      if (!row || row.status !== "pending") throw new Error("Deposit is no longer pending.");
      applyWalletDelta(s, {
        userId: row.brandId,
        availableDelta: row.amountCents,
        type: "credit",
        reason: `EFT deposit confirmed${row.note ? `: ${row.note}` : ""} (confirmed by ${session.email})`,
        referenceType: "brand_deposit",
        referenceId: row.id,
      });
      row.status = "credited";
      row.bankReference = reference;
      row.confirmedBy = session.id;
      row.confirmedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not confirm the deposit." };
  }

  revalidatePath("/dashboard/admin/deposits");
  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/admin/users/${deposit.brandId}`);
  revalidatePath("/dashboard/brand/deposits");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/settings/wallet");
  return { ok: true as const };
}

export async function rejectBrandDepositAction(id: string, note?: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };

  try {
    await updateStore((s) => {
      const row = s.brandDeposits.find((item) => item.id === id);
      if (!row) throw new Error("Deposit not found.");
      if (row.status !== "pending") throw new Error("Only a pending deposit can be rejected.");
      row.status = "rejected";
      row.confirmedBy = session.id;
      row.confirmedAt = nowIso();
      if (note?.trim()) row.note = note.trim();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not reject the deposit." };
  }

  revalidatePath("/dashboard/admin/deposits");
  revalidatePath("/dashboard/brand/deposits");
  return { ok: true as const };
}

/** Safe: never expose bank details in this helper used by pages. */
export async function currentUserId() {
  const session = await getSession();
  return session?.id ?? null;
}

export async function saveKycAction(raw: unknown) {
  const session = await requireSession();
  const parsed = kycSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the identity details." };
  }
  const idNumberEnc = encryptSecret(parsed.data.idNumber.trim());
  await updateStore((s) => {
    const profile = s.profiles.find((p) => p.id === session.id);
    if (!profile) return;
    profile.kyc = {
      legalName: parsed.data.legalName.trim(),
      idNumberEnc,
      country: parsed.data.country.toUpperCase(),
      submittedAt: nowIso(),
      documentPath: profile.kyc?.documentPath ?? null,
      status: "pending",
      reviewedAt: null,
      reviewNote: null,
    };
    profile.updatedAt = profile.kyc.submittedAt;
  });
  revalidatePath("/dashboard/settings/withdraw");
  revalidatePath("/dashboard/admin/withdrawals");
  return { ok: true as const };
}

export async function getMyKyc() {
  const session = await requireSession();
  const store = await readStore();
  const profile = store.profiles.find((p) => p.id === session.id);
  if (!profile?.kyc) return null;
  let idMasked = "****";
  try {
    idMasked = maskAccountNumber(decryptSecret(profile.kyc.idNumberEnc));
  } catch {
    idMasked = "****";
  }
  return {
    legalName: profile.kyc.legalName,
    country: profile.kyc.country,
    idMasked,
    submittedAt: profile.kyc.submittedAt,
    status: profile.kyc.status ?? "pending",
    reviewNote: profile.kyc.reviewNote ?? null,
    documentOnFile: Boolean(profile.kyc.documentPath),
  };
}
