import type { LedgerEntry, Submission } from "@/lib/db/types";

/**
 * What this clip has been set aside or paid, from the ledger.
 * A release only moves the same reserve from pending to available, so it is not added again.
 * Legacy rows used campaign_earning and left earningsCents at 0 after hydration.
 */
export function clipEarnedCents(entries: readonly LedgerEntry[], submission: Pick<Submission, "id" | "reservedCents" | "releasedCents">): number {
  let net = 0;
  for (const entry of entries) {
    if (entry.referenceId !== submission.id) continue;
    if (entry.referenceType === "campaign_earning" || entry.referenceType === "campaign_reserve") {
      net += entry.type === "credit" ? entry.amountCents : -entry.amountCents;
    } else if (entry.referenceType === "campaign_clawback") {
      net -= entry.amountCents;
    }
  }
  return Math.max(net, submission.reservedCents + submission.releasedCents);
}
