import { updateStore } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { finalizeCampaign, settleSubmission } from "@/lib/rewards/earnings";

export type SettleRewardsResult = {
  reservedCents: number;
  releasedCents: number;
  clawedCents: number;
  creditedCents: number;
};

/** Release holds that are due and close ended campaigns. Does not fetch views or pay early. */
export function settleRewardsInStore(store: DatabaseStore, nowMs: number): SettleRewardsResult {
  let reserved = 0;
  let released = 0;
  let clawed = 0;
  for (const sub of store.submissions) {
    if (sub.status !== "approved") continue;
    const result = settleSubmission(store, sub.id, nowMs, sub.postLive === true, sub.postLive != null);
    reserved += result.reserved;
    released += result.released;
    clawed += result.clawed;
  }
  for (const campaign of store.campaigns) {
    finalizeCampaign(store, campaign, nowMs);
  }
  return {
    reservedCents: reserved,
    releasedCents: released,
    clawedCents: clawed,
    creditedCents: reserved,
  };
}

export async function settleRewards(asOf?: string) {
  const nowMs = asOf ? Date.parse(asOf) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error("Invalid asOf.");
  let result: SettleRewardsResult = {
    reservedCents: 0,
    releasedCents: 0,
    clawedCents: 0,
    creditedCents: 0,
  };
  await updateStore((store) => {
    result = settleRewardsInStore(store, nowMs);
  });
  return result;
}
