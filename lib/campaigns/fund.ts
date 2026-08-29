import { readStore } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { adjustWallet } from "@/lib/wallet/ledger";
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
  const store = await readStore();
  if (isCampaignFunded(store, params.campaignId)) {
    return { ok: true };
  }

  const wallet = store.wallets.find((w) => w.userId === params.brandId);
  if (!wallet || wallet.availableCents < params.budgetCents) {
    return {
      ok: false,
      error: `Insufficient wallet balance. You need ${formatMoney(params.budgetCents)} available — record a deposit first.`,
    };
  }

  try {
    await adjustWallet({
      userId: params.brandId,
      availableDelta: -params.budgetCents,
      type: "debit",
      reason: "Campaign budget allocated",
      referenceType: "campaign_fund",
      referenceId: params.campaignId,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not fund campaign.",
    };
  }

  return { ok: true };
}
