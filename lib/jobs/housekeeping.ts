import { nowIso, updateStore } from "@/lib/db/store";
import { refundUndeliveredBooking } from "@/lib/bookings/refund";
import { repairDiscoverableCreators } from "@/lib/influencers/discoverable";
import { budgetAlertsFromStore } from "@/lib/jobs/budget-alerts";
import { finalizeCampaign } from "@/lib/rewards/earnings";
import { applyWalletDelta } from "@/lib/wallet/ledger";

/** Requested bookings, and accepted bookings with no delivery, keep escrow this long. */
export const BOOKING_HOLD_DAYS = 14;

export type HousekeepingResult = {
  campaignsEnded: number;
  campaignsSettled: number;
  budgetReturnedCents: number;
  holdsReleased: number;
  bookingsRefunded: number;
  creatorsRepaired: number;
  budgetAlertCount: number;
};

export function applyHousekeeping(store: Parameters<typeof repairDiscoverableCreators>[0], now = new Date()): HousekeepingResult {
  const nowMs = now.getTime();
  const holdCutoff = nowMs - BOOKING_HOLD_DAYS * 24 * 60 * 60 * 1000;
  const result: HousekeepingResult = {
    campaignsEnded: 0,
    campaignsSettled: 0,
    budgetReturnedCents: 0,
    holdsReleased: 0,
    bookingsRefunded: 0,
    creatorsRepaired: 0,
    budgetAlertCount: 0,
  };
  const at = nowIso();

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

  for (const booking of store.bookings) {
    if (booking.status === "requested") {
      const created = Date.parse(booking.createdAt);
      if (!Number.isFinite(created) || created > holdCutoff) continue;
      const wallet = store.wallets.find((row) => row.userId === booking.brandId);
      if (!wallet || wallet.pendingCents < booking.amountCents) continue;
      applyWalletDelta(store, {
        userId: booking.brandId,
        availableDelta: booking.amountCents,
        pendingDelta: -booking.amountCents,
        type: "credit",
        reason: "Booking request expired. Escrow returned",
        referenceType: "booking_refund",
        referenceId: booking.id,
      });
      booking.status = "cancelled";
      booking.updatedAt = at;
      result.holdsReleased += 1;
      continue;
    }
    if (booking.status === "accepted" && !booking.deliverableUrl) {
      const created = Date.parse(booking.createdAt);
      if (!Number.isFinite(created) || created > holdCutoff) continue;
      if (refundUndeliveredBooking(store, booking.id, at)) result.bookingsRefunded += 1;
    }
  }

  result.creatorsRepaired = repairDiscoverableCreators(store, at);
  result.budgetAlertCount = budgetAlertsFromStore(store).alerts.length;
  return result;
}

/**
 * Ends campaigns whose end date has passed, returns unused budget and fee once,
 * releases stale booking holds, and repairs creator profiles that onboarding left unpublished.
 * Does not read social networks or change view counts.
 */
export async function runHousekeepingJob(now = new Date()): Promise<HousekeepingResult> {
  let result: HousekeepingResult = {
    campaignsEnded: 0,
    campaignsSettled: 0,
    budgetReturnedCents: 0,
    holdsReleased: 0,
    bookingsRefunded: 0,
    creatorsRepaired: 0,
    budgetAlertCount: 0,
  };
  await updateStore((store) => {
    result = applyHousekeeping(store, now);
  });
  return result;
}
