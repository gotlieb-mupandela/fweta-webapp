import { updateStore } from "@/lib/db/store";
import type { Campaign, DatabaseStore } from "@/lib/db/types";
import { feeBpsFromStore, feeReserveForBudget } from "@/lib/rewards/content-rewards";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import { formatMoney } from "@/lib/utils";

/** Net wallet hold for a campaign: fund debits minus budget-return credits. */
export function campaignNetHeldCents(store: DatabaseStore, campaignId: string): number {
  let net = 0;
  for (const entry of store.ledgerEntries) {
    if (entry.referenceType !== "campaign_fund" || entry.referenceId !== campaignId) continue;
    net += entry.type === "debit" ? entry.amountCents : -entry.amountCents;
  }
  return net;
}

export function isCampaignFunded(store: DatabaseStore, campaignId: string): boolean {
  return campaignNetHeldCents(store, campaignId) > 0;
}

/**
 * Move the brand wallet so this campaign's hold matches `targetHoldCents`.
 * Active and paused campaigns hold the full budget. Completed or deleted
 * campaigns hold only what was already paid to creators; the rest returns.
 */
export function syncCampaignHold(
  store: DatabaseStore,
  campaign: { id: string; brandId: string },
  targetHoldCents: number,
  reason: string,
) {
  if (!Number.isInteger(targetHoldCents) || targetHoldCents < 0) {
    throw new Error("Invalid campaign budget.");
  }
  const delta = targetHoldCents - campaignNetHeldCents(store, campaign.id);
  if (delta === 0) return;

  if (delta > 0) {
    const wallet = store.wallets.find((w) => w.userId === campaign.brandId);
    if (!wallet || wallet.availableCents < delta) {
      throw new Error(
        `Insufficient wallet balance. You need ${formatMoney(delta)} available. Record a deposit first.`,
      );
    }
    applyWalletDelta(store, {
      userId: campaign.brandId,
      availableDelta: -delta,
      type: "debit",
      reason,
      referenceType: "campaign_fund",
      referenceId: campaign.id,
    });
    return;
  }

  applyWalletDelta(store, {
    userId: campaign.brandId,
    availableDelta: -delta,
    type: "credit",
    reason,
    referenceType: "campaign_fund",
    referenceId: campaign.id,
  });
}

export async function fundCampaignFromWallet(params: {
  brandId: string;
  campaignId: string;
  budgetCents: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(params.budgetCents) || params.budgetCents <= 0) {
    return { ok: false, error: "Invalid budget amount." };
  }

  try {
    await updateStore((s) => {
      syncCampaignHold(
        s,
        { id: params.campaignId, brandId: params.brandId },
        params.budgetCents,
        "Campaign budget allocated",
      );
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not fund campaign.",
    };
  }

  return { ok: true };
}

/** Lock the creator budget and the brand-side fee reserve. Must run inside updateStore. */
export function allocateCampaignFunds(store: DatabaseStore, campaign: Campaign) {
  if (isCampaignFunded(store, campaign.id)) return;
  const bps = feeBpsFromStore(store);
  campaign.feeBps = bps;
  const fee = feeReserveForBudget(campaign.budgetTotalCents, bps);
  const need = campaign.budgetTotalCents + fee;
  const wallet = store.wallets.find((w) => w.userId === campaign.brandId);
  if (!wallet || wallet.availableCents < need) {
    throw new Error(
      `Insufficient wallet balance. You need ${formatMoney(need)} available (${formatMoney(campaign.budgetTotalCents)} budget plus ${formatMoney(fee)} fee set-aside). Record a deposit first.`,
    );
  }
  applyWalletDelta(store, {
    userId: campaign.brandId,
    availableDelta: -campaign.budgetTotalCents,
    type: "debit",
    reason: "Campaign budget reserved",
    referenceType: "campaign_fund",
    referenceId: campaign.id,
  });
  if (fee > 0) {
    applyWalletDelta(store, {
      userId: campaign.brandId,
      availableDelta: -fee,
      type: "debit",
      reason: "Platform fee set aside. Charged only on views that are paid.",
      referenceType: "campaign_fee",
      referenceId: campaign.id,
    });
  }
  campaign.feeReservedCents = fee;
}
