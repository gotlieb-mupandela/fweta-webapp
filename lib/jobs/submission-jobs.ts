import "server-only";

import { revalidatePath } from "next/cache";

import { nowIso, readStore, updateStore } from "@/lib/db/store";
import { applyPolledViews, polledViewWriteBlocked } from "@/lib/jobs/apply-polled-views";
import { settlementInstant, settleRewardsInStore } from "@/lib/rewards/settle-job";
import { isViewEntryClosed } from "@/lib/rewards/view-entry";
import { fetchVideoViewsFromApify, isApifyConfigured } from "@/lib/social/apify";

/**
 * Poll submissions. The cron route /api/jobs/poll-views calls this.
 * Uses Apify when APIFY_API_TOKEN is set. Otherwise simulates view growth.
 * Whether a total is written is decided by the shared view guard inside the
 * store update, not by a second copy of those checks.
 */
export async function pollSubmissionViewsJob() {
  const store = await readStore();
  const useApify = isApifyConfigured();
  let failed = 0;

  // Phase 1: fetch (network-bound, no writes). One bad URL never aborts the job.
  const pending = new Map<string, number>();
  for (const submission of store.submissions) {
    try {
      const campaign = store.campaigns.find((c) => c.id === submission.campaignId);
      if (!campaign || campaign.status !== "active" || isViewEntryClosed(campaign)) continue;
      if (campaign.budgetSpentCents >= campaign.budgetTotalCents) continue;
      if (polledViewWriteBlocked(store, submission.id, submission.views, { ignoreEqualTotal: true })) continue;

      let newViews: number;
      if (useApify) {
        try {
          const fetched = await fetchVideoViewsFromApify(submission.postUrl);
          if (fetched == null) {
            failed += 1;
            continue;
          }
          // Guard against scraper regressions (views should not go backwards).
          newViews = Math.max(fetched, submission.views);
        } catch {
          failed += 1;
          continue;
        }
      } else {
        const growth = Math.floor(200 + Math.random() * 1800);
        newViews = submission.views + growth;
      }

      if (newViews === submission.views) continue;
      pending.set(submission.id, newViews);
    } catch {
      failed += 1;
    }
  }

  // Phase 2: one write for every view update. Separate writes each saved the
  // whole store and timed out. The callback rechecks approval, an active
  // campaign, and the shared guard on the store being saved.
  let updated = 0;
  if (pending.size > 0) {
    const at = nowIso();
    await updateStore((s) => {
      updated = applyPolledViews(s, pending, at);
    });
  }

  const earnings = await recalculateEarningsJob();
  return {
    updated,
    failed,
    mode: useApify ? ("apify" as const) : ("simulated" as const),
    ...earnings,
  };
}

function revalidateEarningsPaths() {
  // Earnings are already stored. Next throws this call when there is no request cache.
  try {
    revalidatePath("/dashboard/clipper");
    revalidatePath("/dashboard/brand");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("static generation store missing")) throw error;
  }
}

export async function recalculateEarningsJob(asOf?: string) {
  const nowMs = settlementInstant(asOf);
  let totals = { reservedCents: 0, releasedCents: 0, clawedCents: 0 };

  // One write for every clip. The status check and the wallet write share
  // this callback, so a second run sees the first run's balances.
  await updateStore((store) => {
    totals = settleRewardsInStore(store, nowMs);
  });

  revalidateEarningsPaths();
  return {
    reservedCents: totals.reservedCents,
    releasedCents: totals.releasedCents,
    clawedCents: totals.clawedCents,
    creditedCents: totals.reservedCents,
  };
}

export async function budgetAlertsJob() {
  const store = await readStore();
  const alerts = store.campaigns
    .filter((c) => c.status === "active")
    .filter((c) => c.budgetSpentCents / c.budgetTotalCents >= 0.8)
    .map((c) => ({
      campaignId: c.id,
      title: c.title,
      brandId: c.brandId,
      spentRatio: c.budgetSpentCents / c.budgetTotalCents,
    }));
  return { alerts };
}

/** Close ended campaigns, accrue from confirmed views, and release holds that are due. */
export async function settleRewardsJob(asOf?: string) {
  return recalculateEarningsJob(asOf);
}
