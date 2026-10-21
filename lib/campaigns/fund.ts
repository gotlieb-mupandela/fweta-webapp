import { readStore, updateStore } from "@/lib/db/store";
import type { Campaign, DatabaseStore } from "@/lib/db/types";
import { feeBpsFromStore, feeReserveForBudget } from "@/lib/rewards/content-rewards";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import { formatMoney } from "@/lib/utils";

export function isCampaignFunded(store: DatabaseStore, campaignId: string): boolean {
  return store.ledgerEntries.some(
    (e) => e.referenceType === "campaign_fund" && e.referenceId === campaignId,
  );
}

export async function fundCampaignFromWallet(params: {
  brandId: string;
  campaignId: string;
  budgetCents: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(params.budgetCents) || params.budgetCents <= 0) {
    return { ok: false, error: "Invalid budget amount." };
  }

  // Fast path: already funded.
  const snapshot = await readStore();
  if (isCampaignFunded(snapshot, params.campaignId)) {
    return { ok: true };
  }

  // Atomic check + debit: prevents double-funding when two requests race.
  try {
    await updateStore((s) => {
      if (isCampaignFunded(s, params.campaignId)) return;
      const wallet = s.wallets.find((w) => w.userId === params.brandId);
      if (!wallet || wallet.availableCents < params.budgetCents) {
        throw new Error(
          `Insufficient wallet balance. You need ${formatMoney(params.budgetCents)} available. Submit an EFT deposit and wait for admin confirmation, then publish.`,
        );
      }
      applyWalletDelta(s, {
        userId: params.brandId,
        availableDelta: -params.budgetCents,
        type: "debit",
        reason: "Campaign budget allocated",
        referenceType: "campaign_fund",
        referenceId: params.campaignId,
      });
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
