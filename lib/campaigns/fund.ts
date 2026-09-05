import { readStore, updateStore } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
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
          `Insufficient wallet balance. You need ${formatMoney(params.budgetCents)} available — record a deposit first.`,
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
