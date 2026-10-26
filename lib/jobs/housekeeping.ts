import { ensureAdminAccount } from "@/lib/auth/session";
import { nowIso, updateStore } from "@/lib/db/store";
import { repairDiscoverableCreators } from "@/lib/influencer/discover";
import { finalizeCampaign } from "@/lib/rewards/earnings";
import { applyWalletDelta } from "@/lib/wallet/ledger";

/** Requested bookings keep escrow this long, then the daily job returns it. */
export const BOOKING_HOLD_DAYS = 14;

export type HousekeepingResult = {
  campaignsEnded: number;
  campaignsSettled: number;
  budgetReturnedCents: number;
  holdsReleased: number;
  creatorsRepaired: number;
  adminSeeded: boolean;
  duplicateProfileEmails: string[];
};

/**
 * Ends campaigns whose end date has passed, returns unused budget and fee once,
 * releases booking escrow that has sat in "requested" for 14 days, and creates
 * a public profile for each finished creator who has none and has not hidden one.
 * Creates the env admin only when ADMIN_EMAIL is not already a profile.
 * Reports duplicate profile emails and does not delete those profiles.
 * Does not read social networks or change view counts.
 */
export async function runHousekeepingJob(now = new Date()): Promise<HousekeepingResult> {
  const nowMs = now.getTime();
  const holdCutoff = nowMs - BOOKING_HOLD_DAYS * 24 * 60 * 60 * 1000;
  const admin = await ensureAdminAccount();
  const result: HousekeepingResult = {
    campaignsEnded: 0,
    campaignsSettled: 0,
    budgetReturnedCents: 0,
    holdsReleased: 0,
    creatorsRepaired: 0,
    adminSeeded: admin.seeded,
    duplicateProfileEmails: admin.duplicateEmails,
  };

  await updateStore((store) => {
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
      if (booking.status !== "requested") continue;
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
    }

    result.creatorsRepaired += repairDiscoverableCreators(store, at);
  });

  return result;
}
