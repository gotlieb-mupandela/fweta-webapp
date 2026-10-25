import type { DatabaseStore } from "@/lib/db/types";
import { clawbackSubmission, finalizeCampaign, settleSubmission } from "@/lib/rewards/earnings";

export type SettlementTotals = {
  reservedCents: number;
  releasedCents: number;
  clawedCents: number;
};

/**
 * One rewards pass. Must run inside updateStore.
 * Clawed-back and fraud-upheld clips are not credited. An upheld clip that
 * still has money set aside is clawed once, then left alone.
 */
export function settleRewardsInStore(store: DatabaseStore, nowMs: number): SettlementTotals {
  const totals: SettlementTotals = { reservedCents: 0, releasedCents: 0, clawedCents: 0 };

  for (const sub of store.submissions) {
    if (sub.payoutState === "clawed_back" || sub.fraudState === "upheld" || sub.status !== "approved") {
      if (sub.fraudState === "upheld" && sub.payoutState !== "clawed_back" && sub.reservedCents > 0) {
        totals.clawedCents += clawbackSubmission(
          store,
          sub.id,
          nowMs,
          "Review upheld. This clip was forfeited.",
        );
      }
      continue;
    }
    const result = settleSubmission(store, sub.id, nowMs, sub.postLive, sub.postLive != null);
    totals.reservedCents += result.reserved;
    totals.releasedCents += result.released;
    totals.clawedCents += result.clawed;
  }

  for (const campaign of store.campaigns) {
    finalizeCampaign(store, campaign, nowMs);
  }

  return totals;
}

export function settlementInstant(asOf?: string): number {
  if (!asOf) return Date.now();
  const parsed = Date.parse(asOf);
  return Number.isFinite(parsed) ? parsed : Date.now();
}
