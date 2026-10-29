import { readStore } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";

export function budgetAlertsFromStore(store: DatabaseStore) {
  const alerts = store.campaigns
    .filter((campaign) => campaign.status === "active" && campaign.budgetTotalCents > 0)
    .filter((campaign) => campaign.budgetSpentCents / campaign.budgetTotalCents >= 0.8)
    .map((campaign) => ({
      campaignId: campaign.id,
      title: campaign.title,
      brandId: campaign.brandId,
      spentRatio: campaign.budgetSpentCents / campaign.budgetTotalCents,
    }));
  return { alerts };
}

/** Read-only. Used by the housekeeping cron, not by a public server action. */
export async function budgetAlerts() {
  const store = await readStore();
  return budgetAlertsFromStore(store);
}
