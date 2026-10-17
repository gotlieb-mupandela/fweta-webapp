import { isCampaignFunded } from "@/lib/campaigns/fund";
import { nowIso, updateStore } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { applyWalletDelta } from "@/lib/wallet/ledger";

/** Requested bookings keep escrow this long, then the daily job returns it. */
export const BOOKING_HOLD_DAYS = 14;

export type HousekeepingResult = {
  campaignsEnded: number;
  campaignsSettled: number;
  budgetReturnedCents: number;
  holdsReleased: number;
};

function campaignEnded(endDate: string | null, nowMs: number): boolean {
  if (!endDate) return false;
  const ends = Date.parse(endDate);
  return Number.isFinite(ends) && ends <= nowMs;
}

function alreadySettled(store: DatabaseStore, campaignId: string): boolean {
  return store.ledgerEntries.some(
    (entry) => entry.referenceType === "campaign_settlement" && entry.referenceId === campaignId,
  );
}

/**
 * Ends campaigns whose end date has passed, returns unused funded budget once,
 * and releases booking escrow that has sat in "requested" for 14 days.
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
    const at = nowIso();

    for (const campaign of store.campaigns) {
      if (campaign.status !== "active" && campaign.status !== "paused") continue;
      if (!campaignEnded(campaign.endDate, nowMs)) continue;
      campaign.status = "completed";
      campaign.updatedAt = at;
      result.campaignsEnded += 1;
    }

    for (const campaign of store.campaigns) {
      if (campaign.status !== "completed" || campaign.settledAt) continue;
      if (alreadySettled(store, campaign.id)) {
        campaign.settledAt = at;
        result.campaignsSettled += 1;
        continue;
      }

      const remaining = Math.max(0, campaign.budgetTotalCents - campaign.budgetSpentCents);
      if (remaining > 0 && isCampaignFunded(store, campaign.id)) {
        applyWalletDelta(store, {
          userId: campaign.brandId,
          availableDelta: remaining,
          type: "credit",
          reason: "Campaign ended — unused budget returned",
          referenceType: "campaign_settlement",
          referenceId: campaign.id,
        });
        result.budgetReturnedCents += remaining;
      }
      campaign.settledAt = at;
      campaign.updatedAt = at;
      result.campaignsSettled += 1;
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
        reason: "Booking request expired — escrow returned",
        referenceType: "booking_refund",
        referenceId: booking.id,
      });
      booking.status = "cancelled";
      booking.updatedAt = at;
      result.holdsReleased += 1;
    }
  });

  return result;
}
