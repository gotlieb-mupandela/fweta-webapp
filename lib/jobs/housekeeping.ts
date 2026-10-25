import { releaseExpiredBookingHolds } from "@/lib/bookings/escrow";
import { updateStore } from "@/lib/db/store";
import { finalizeCampaign } from "@/lib/rewards/earnings";

/** Requested bookings keep escrow this long, then the daily job returns it. */
export const BOOKING_HOLD_DAYS = 14;

export type HousekeepingResult = {
  campaignsEnded: number;
  campaignsSettled: number;
  budgetReturnedCents: number;
  holdsReleased: number;
};

/**
 * Ends campaigns whose end date has passed, returns unused budget and fee once,
 * and releases booking escrow that has sat in "requested" for 14 days.
 * Expiry uses the same refund guard as a decline, so a race between them refunds once.
 * Does not read social networks or change view counts.
 */
export async function runHousekeepingJob(now = new Date()): Promise<HousekeepingResult> {
  const nowMs = now.getTime();
  const holdCutoff = nowMs - BOOKING_HOLD_DAYS * 24 * 60 * 60 * 1000;
  const result: HousekeepingResult = {
    campaignsEnded: 0,
    campaignsSettled: 0,
    budgetReturnedCents: 0,
    holdsReleased: 0,
  };

  await updateStore((store) => {
    for (const campaign of store.campaigns) {
      if (campaign.settledAt) continue;
      const wasLive = campaign.status === "active" || campaign.status === "paused";
      const returnedBefore = campaign.unspentReturnedCents + campaign.feeRefundedCents;
      finalizeCampaign(store, campaign, nowMs);
      if (wasLive && campaign.status === "completed") result.campaignsEnded += 1;
      if (campaign.closedAt) {
        campaign.settledAt = campaign.closedAt;
        result.campaignsSettled += 1;
        result.budgetReturnedCents +=
          campaign.unspentReturnedCents + campaign.feeRefundedCents - returnedBefore;
      }
    }

    // Assign, do not add. A compare-and-swap retry runs this callback again
    // on a fresh document, so the count has to be this attempt's releases.
    result.holdsReleased = releaseExpiredBookingHolds(store, holdCutoff);
  });

  return result;
}
