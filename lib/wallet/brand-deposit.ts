import type { BrandDeposit, DatabaseStore } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";

const CONFIRM_CLOSED: Record<string, string> = {
  rejected: "This pay-in was rejected.",
  cancelled: "This pay-in was cancelled.",
  expired: "This pay-in has expired.",
  credited: "This pay-in is already credited.",
};

const REJECT_CLOSED: Record<string, string> = {
  rejected: "This pay-in was already rejected.",
  cancelled: "This pay-in was cancelled.",
  expired: "This pay-in has expired.",
  credited: "This pay-in is already credited.",
};

/** Null when the pay-in can be confirmed. Any other status is refused. */
export function payInConfirmError(status: string): string | null {
  if (status === "pending") return null;
  return CONFIRM_CLOSED[status] ?? "Only a pending pay-in can be confirmed.";
}

/** Null when the pay-in can be rejected. Any other status is refused. */
export function payInRejectError(status: string): string | null {
  if (status === "pending") return null;
  return REJECT_CLOSED[status] ?? "Only a pending pay-in can be rejected.";
}

function assertAdmin(roles: readonly string[]) {
  if (!roles.includes("admin")) throw new Error("Admin only.");
}

/**
 * Credit a manual EFT only while it is still pending.
 * Call this inside the same updateStore write as the ledger row.
 * A second confirm then sees credited and does not add another row.
 */
export function confirmPendingPayIn(
  store: DatabaseStore,
  input: {
    depositId: string;
    actorId: string;
    actorRoles: readonly string[];
    bankReference?: string | null;
    now: string;
    reason: string | ((row: BrandDeposit) => string);
  },
): BrandDeposit {
  assertAdmin(input.actorRoles);
  const row = store.brandDeposits.find((item) => item.id === input.depositId);
  if (!row) throw new Error("Pay-in not found.");
  const statusError = payInConfirmError(row.status);
  if (statusError) throw new Error(statusError);

  const reason = typeof input.reason === "function" ? input.reason(row) : input.reason;
  applyWalletDelta(store, {
    userId: row.brandId,
    availableDelta: row.amountCents,
    type: "credit",
    reason,
    referenceType: "brand_deposit",
    referenceId: row.id,
  });
  row.status = "credited";
  const reference = input.bankReference?.trim();
  if (reference) row.bankReference = reference;
  row.confirmedBy = input.actorId;
  row.confirmedAt = input.now;
  return row;
}

/** Reject a manual EFT only while it is still pending. Does not touch the wallet. */
export function rejectPendingPayIn(
  store: DatabaseStore,
  input: {
    depositId: string;
    actorId: string;
    actorRoles: readonly string[];
    note?: string | null;
    now: string;
  },
): BrandDeposit {
  assertAdmin(input.actorRoles);
  const row = store.brandDeposits.find((item) => item.id === input.depositId);
  if (!row) throw new Error("Pay-in not found.");
  const statusError = payInRejectError(row.status);
  if (statusError) throw new Error(statusError);
  row.status = "rejected";
  row.confirmedBy = input.actorId;
  row.confirmedAt = input.now;
  if (input.note?.trim()) row.note = input.note.trim();
  return row;
}

/** Blank and missing references stay hidden so older rows still render. */
export function payInReferenceLabel(bankReference: string | null | undefined): string | null {
  if (typeof bankReference !== "string") return null;
  const trimmed = bankReference.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function payInStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Waiting";
    case "credited":
      return "Confirmed";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

export function payInRowView(deposit: {
  amountCents: number;
  note: string;
  status: string;
  bankReference: string | null;
}): {
  amountCents: number;
  note: string;
  statusLabel: string;
  reference: string | null;
} {
  return {
    amountCents: deposit.amountCents,
    note: deposit.note,
    statusLabel: payInStatusLabel(deposit.status),
    reference: payInReferenceLabel(deposit.bankReference),
  };
}
