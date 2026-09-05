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
import { withdrawalSchema } from "@/lib/validations/withdrawal";
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
  if (amountCents <= 0) return { ok: false as const, error: "Amount must be positive." };
  await adjustWallet({
    userId,
    availableDelta: amountCents,
    type: "credit",
    reason: reason || "Admin credit",
    referenceType: "admin_credit",
  });
  revalidatePath("/dashboard/admin");
  return { ok: true as const };
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
        reason: "Withdrawal rejected — funds restored",
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
  if (amountCents <= 0) return { ok: false as const, error: "Invalid amount." };

  const id = newId();
  try {
    await updateStore((s) => {
      s.brandDeposits.push({
        id,
        brandId: session.id,
        amountCents,
        note: note || "Manual deposit (v1)",
        status: "credited",
        createdAt: nowIso(),
      });
      applyWalletDelta(s, {
        userId: session.id,
        availableDelta: amountCents,
        type: "credit",
        reason: note || "Brand deposit (manual)",
        referenceType: "brand_deposit",
        referenceId: id,
      });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/brand/deposits");
  return { ok: true as const };
}

/** Safe: never expose bank details in this helper used by pages. */
export async function currentUserId() {
  const session = await getSession();
  return session?.id ?? null;
}
