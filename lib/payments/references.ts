import type { DatabaseStore } from "@/lib/db/types";

export function normalizeBankReference(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

/** True when another deposit or payout already used this reference. Rejected rows do not count. */
export function bankReferenceTaken(
  store: Pick<DatabaseStore, "brandDeposits" | "withdrawalRequests">,
  reference: string,
  except?: { depositId?: string; withdrawalId?: string },
): boolean {
  const key = reference.trim().toLowerCase();
  if (!key) return false;
  for (const deposit of store.brandDeposits) {
    if (deposit.id === except?.depositId) continue;
    if (deposit.status === "rejected") continue;
    if (deposit.bankReference?.trim().toLowerCase() === key) return true;
  }
  for (const withdrawal of store.withdrawalRequests) {
    if (withdrawal.id === except?.withdrawalId) continue;
    if (withdrawal.status === "rejected") continue;
    if (withdrawal.bankReference?.trim().toLowerCase() === key) return true;
  }
  return false;
}
