import type { BrandDeposit, DatabaseStore } from "@/lib/db/types";
import { bankReferenceSchema } from "@/lib/validations/accounts";
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

/** Trim, lowercase, then drop spaces, hyphens, and slashes. Trailing newlines stay a trim. */
function referenceKey(value: string): string {
  return value.trim().toLowerCase().replace(/[ /\-]/g, "");
}

function referenceMatches(
  item: BrandDeposit,
  key: string,
  exceptId?: string,
): boolean {
  if (!key) return false;
  if (item.status === "rejected") return false;
  if (exceptId && item.id === exceptId) return false;
  if (typeof item.bankReference !== "string") return false;
  return referenceKey(item.bankReference) === key;
}

/** Same-brand duplicate. Rejected pay-ins do not hold their reference. */
export function duplicatePayInReference(
  store: DatabaseStore,
  reference: string,
  brandId: string,
  exceptId?: string,
): boolean {
  const key = referenceKey(reference);
  if (!key) return false;
  return store.brandDeposits.some(
    (item) => item.brandId === brandId && referenceMatches(item, key, exceptId),
  );
}

function otherBrandUsesReference(store: DatabaseStore, reference: string, brandId: string): boolean {
  const key = referenceKey(reference);
  if (!key) return false;
  return store.brandDeposits.some(
    (item) => item.brandId !== brandId && referenceMatches(item, key),
  );
}

const DUPLICATE_REFERENCE = "That bank reference is already used on another pay-in.";

/**
 * Append a manual pay-in. An invalid reference returns an error and does not write.
 * Call this inside updateStore so a duplicate check sees the same document.
 */
export function fileManualPayIn(
  store: DatabaseStore,
  input: {
    id: string;
    brandId: string;
    amountCents: number;
    note: string;
    bankReference: string;
    createdAt: string;
  },
): { ok: true } | { ok: false; error: string } {
  const parsed = bankReferenceSchema.safeParse(input.bankReference);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter the bank reference from your EFT.",
    };
  }
  if (referenceKey(parsed.data).length < 4) {
    return { ok: false, error: "Enter the bank reference from your EFT." };
  }
  if (duplicatePayInReference(store, parsed.data, input.brandId)) {
    return { ok: false, error: DUPLICATE_REFERENCE };
  }
  const matchesOtherBrand = otherBrandUsesReference(store, parsed.data, input.brandId);
  store.brandDeposits.push({
    id: input.id,
    brandId: input.brandId,
    amountCents: input.amountCents,
    note: input.note,
    status: "pending",
    bankReference: parsed.data,
    referenceMatchesOtherBrand: matchesOtherBrand ? true : undefined,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: input.createdAt,
  });
  return { ok: true };
}

/**
 * Keep a reference the brand already filed.
 * An empty brand reference may take the admin's trimmed value when that value is valid.
 */
function applyConfirmReference(
  store: DatabaseStore,
  row: BrandDeposit,
  supplied: string | null | undefined,
) {
  const existing = typeof row.bankReference === "string" ? row.bankReference.trim() : "";
  if (existing) return;
  if (typeof supplied !== "string" || !supplied.trim()) return;
  const parsed = bankReferenceSchema.safeParse(supplied);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Enter the bank reference from your EFT.");
  }
  if (referenceKey(parsed.data).length < 4) {
    throw new Error("Enter the bank reference from your EFT.");
  }
  if (duplicatePayInReference(store, parsed.data, row.brandId, row.id)) {
    throw new Error(DUPLICATE_REFERENCE);
  }
  row.bankReference = parsed.data;
  if (otherBrandUsesReference(store, parsed.data, row.brandId)) {
    row.referenceMatchesOtherBrand = true;
  }
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
  if (input.actorId === row.brandId) {
    throw new Error("You cannot confirm your own pay-in.");
  }
  applyConfirmReference(store, row, input.bankReference);

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

export const OTHER_BRAND_REFERENCE_WARNING =
  "This reference matches another brand. Check it before confirming.";

export function payInRowView(deposit: {
  amountCents: number;
  note: string;
  status: string;
  bankReference: string | null;
  referenceMatchesOtherBrand?: boolean;
}): {
  amountCents: number;
  note: string;
  statusLabel: string;
  reference: string | null;
  otherBrandWarning: string | null;
} {
  return {
    amountCents: deposit.amountCents,
    note: deposit.note,
    statusLabel: payInStatusLabel(deposit.status),
    reference: payInReferenceLabel(deposit.bankReference),
    otherBrandWarning: deposit.referenceMatchesOtherBrand ? OTHER_BRAND_REFERENCE_WARNING : null,
  };
}
