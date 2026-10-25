import type { DatabaseStore } from "@/lib/db/types";
import { pushAudit } from "@/lib/marketplace/audit";
import { formatMoney } from "@/lib/utils";
import { applyWalletDelta } from "@/lib/wallet/ledger";

export type AdminCreditWrite = {
  adminId: string;
  adminEmail: string;
  userId: string;
  amountCents: number;
  reason: string;
};

export type AdminCreditResult =
  | { ok: true; availableCents: number; entryId: string }
  | { ok: false; error: string };

/**
 * Credit a wallet and record the acting admin. Must run inside updateStore
 * so the ledger row and the audit row commit together, or not at all.
 */
export function creditWalletInStore(store: DatabaseStore, input: AdminCreditWrite): AdminCreditResult {
  const user = store.profiles.find((profile) => profile.id === input.userId);
  if (!user) return { ok: false, error: "User not found." };

  const { wallet, entry } = applyWalletDelta(store, {
    userId: input.userId,
    availableDelta: input.amountCents,
    type: "credit",
    reason: input.reason,
    referenceType: "admin_credit",
    actorId: input.adminId,
    actorEmail: input.adminEmail,
  });
  pushAudit(store, {
    actorId: input.adminId,
    actorEmail: input.adminEmail,
    action: "wallet.admin_credit",
    summary: `${input.adminEmail} credited ${formatMoney(input.amountCents)} to ${input.userId}. ${input.reason}`,
    targetType: "profile",
    targetId: input.userId,
    amountCents: input.amountCents,
    note: input.reason,
  });
  return { ok: true, availableCents: wallet.availableCents, entryId: entry.id };
}
