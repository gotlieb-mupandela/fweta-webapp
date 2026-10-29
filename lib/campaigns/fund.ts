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

/** Move a funded campaign's budget. Also adjusts the fee reserve that was locked at publish. */
export function adjustFundedBudget(store: DatabaseStore, campaign: Campaign, nextBudget: number) {
  if (!Number.isInteger(nextBudget) || nextBudget <= 0) {
    throw new Error("Budget must be greater than zero.");
  }
  if (nextBudget < campaign.budgetSpentCents) {
    throw new Error(
      `Budget can't go below the ${formatMoney(campaign.budgetSpentCents)} already paid out.`,
    );
  }
  if (!isCampaignFunded(store, campaign.id)) return;

  const bps = Number.isInteger(campaign.feeBps) ? (campaign.feeBps as number) : feeBpsFromStore(store);
  const nextFee = Math.max(feeReserveForBudget(nextBudget, bps), campaign.feeChargedCents);
  const budgetDelta = nextBudget - campaign.budgetTotalCents;
  const feeDelta = nextFee - campaign.feeReservedCents;
  const need = budgetDelta + feeDelta;
  if (need > 0) {
    const wallet = store.wallets.find((w) => w.userId === campaign.brandId);
    if (!wallet || wallet.availableCents < need) {
      throw new Error(
        `Insufficient wallet balance. Raising the budget needs ${formatMoney(need)} available. Record a deposit and wait for an admin to credit it.`,
      );
    }
  }
  if (budgetDelta !== 0) {
    applyWalletDelta(store, {
      userId: campaign.brandId,
      availableDelta: -budgetDelta,
      type: budgetDelta > 0 ? "debit" : "credit",
      reason: budgetDelta > 0 ? "Campaign budget increased" : "Campaign budget reduced, returned",
      referenceType: "campaign_fund",
      referenceId: campaign.id,
    });
  }
  if (feeDelta !== 0) {
    applyWalletDelta(store, {
      userId: campaign.brandId,
      availableDelta: -feeDelta,
      type: feeDelta > 0 ? "debit" : "credit",
      reason: feeDelta > 0 ? "Platform fee set aside for the new budget" : "Platform fee reserve returned",
      referenceType: "campaign_fee",
      referenceId: campaign.id,
    });
    campaign.feeReservedCents = nextFee;
    if (!Number.isInteger(campaign.feeBps)) campaign.feeBps = bps;
  }
}

/** Return unused creator budget and unused fee reserve once. Safe to call again. */
export function returnUnusedCampaignFunds(store: DatabaseStore, campaign: Campaign): {
  budgetCents: number;
  feeCents: number;
} {
  if (!isCampaignFunded(store, campaign.id)) return { budgetCents: 0, feeCents: 0 };
  const budget = Math.max(
    0,
    campaign.budgetTotalCents - campaign.budgetSpentCents - campaign.unspentReturnedCents,
  );
  const fee = Math.max(0, campaign.feeReservedCents - campaign.feeChargedCents - campaign.feeRefundedCents);
  if (budget > 0) {
    applyWalletDelta(store, {
      userId: campaign.brandId,
      availableDelta: budget,
      type: "credit",
      reason: `Unused campaign budget returned, ${campaign.title}`,
      referenceType: "campaign_fund",
      referenceId: campaign.id,
    });
    campaign.unspentReturnedCents += budget;
    campaign.budgetTotalCents = campaign.budgetSpentCents;
  }
  if (fee > 0) {
    applyWalletDelta(store, {
      userId: campaign.brandId,
      availableDelta: fee,
      type: "credit",
      reason: `Unused platform fee returned, ${campaign.title}`,
      referenceType: "campaign_fee",
      referenceId: campaign.id,
    });
    campaign.feeRefundedCents += fee;
  }
  return { budgetCents: budget, feeCents: fee };
}
