import { nowIso } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";

export type WithdrawalTransitionResult =
  | { ok: true }
  | { ok: false; error: "Not found." | "Already processed." };

/**
 * Mark a pending withdrawal paid. Must run inside updateStore.
 * A second call sees the new status and does not move money.
 */
export function markWithdrawalPaidInStore(
  store: DatabaseStore,
  id: string,
  bankReference: string | null,
): WithdrawalTransitionResult {
  const withdrawal = store.withdrawalRequests.find((row) => row.id === id);
  if (!withdrawal) return { ok: false, error: "Not found." };
  if (withdrawal.status !== "pending") return { ok: false, error: "Already processed." };

  applyWalletDelta(store, {
    userId: withdrawal.userId,
    availableDelta: 0,
    pendingDelta: -withdrawal.amountCents,
    type: "debit",
    reason: "Withdrawal paid via EFT",
    referenceType: "withdrawal",
    referenceId: withdrawal.id,
  });
  const at = nowIso();
  withdrawal.status = "paid";
  withdrawal.bankReference = bankReference;
  withdrawal.paidAt = at;
  withdrawal.updatedAt = at;
  return { ok: true };
}

/**
 * Reject a pending withdrawal and return the hold to available.
 * Must run inside updateStore. A paid or already rejected row is left untouched.
 */
export function rejectWithdrawalInStore(
  store: DatabaseStore,
  id: string,
  note: string | null,
): WithdrawalTransitionResult {
  const withdrawal = store.withdrawalRequests.find((row) => row.id === id);
  if (!withdrawal) return { ok: false, error: "Not found." };
  if (withdrawal.status !== "pending") return { ok: false, error: "Already processed." };

  applyWalletDelta(store, {
    userId: withdrawal.userId,
    availableDelta: withdrawal.amountCents,
    pendingDelta: -withdrawal.amountCents,
    type: "credit",
    reason: "Withdrawal rejected. Funds restored",
    referenceType: "withdrawal",
    referenceId: withdrawal.id,
  });
  withdrawal.status = "rejected";
  withdrawal.adminNote = note;
  withdrawal.updatedAt = nowIso();
  return { ok: true };
}
