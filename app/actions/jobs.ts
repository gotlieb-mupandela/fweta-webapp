"use server";

import { revalidatePath } from "next/cache";

import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { ViewSnapshot } from "@/lib/db/types";
import { settlementInstant, settleRewardsInStore } from "@/lib/rewards/settle-job";
import { isViewEntryClosed } from "@/lib/rewards/view-entry";
import { fetchVideoViewsFromApify, isApifyConfigured } from "@/lib/social/apify";

function confirmedSnapshot(submissionId: string, views: number, at: string, source: ViewSnapshot["source"]): ViewSnapshot {
  return {
    id: newId(),
    submissionId,
    views,
    likes: null,
    comments: null,
    note: null,
    screenshotPath: null,
    recordedAt: at,
    checkedBy: null,
    source,
    status: "confirmed",
  };
}

/**
 * Phase 7 automation, callable via /api/jobs/poll-views or cron.
 * Uses Apify when APIFY_API_TOKEN is set; otherwise simulates view growth.
 */
export async function pollSubmissionViewsJob() {
  const store = await readStore();
  const approved = store.submissions.filter((s) => s.status === "approved");
  const useApify = isApifyConfigured();
  let failed = 0;

  // Phase 1: fetch (network-bound, no writes). One bad URL never aborts the job.
  const pending = new Map<string, number>();
  for (const submission of approved) {
    try {
      const campaign = store.campaigns.find((c) => c.id === submission.campaignId);
      if (!campaign || campaign.status !== "active" || isViewEntryClosed(campaign)) continue;
      if (campaign.budgetSpentCents >= campaign.budgetTotalCents) continue;
      if (submission.payoutState === "clawed_back" || submission.fraudState === "upheld") continue;

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

  // Phase 2: single atomic write for all view updates (was N sequential writes,
  // each triggering a full Supabase save, which was slow and timeout-prone).
  let updated = 0;
  if (pending.size > 0) {
    const at = nowIso();
    await updateStore((s) => {
      for (const [id, views] of pending) {
        const sub = s.submissions.find((x) => x.id === id);
        if (!sub || sub.status !== "approved") continue;
        if (sub.payoutState === "clawed_back" || sub.fraudState === "upheld") continue;
        // Re-check inside the transaction; skip regressions per-record.
        if (views <= sub.views) continue;
        const campaign = s.campaigns.find((item) => item.id === sub.campaignId);
        if (!campaign || campaign.status !== "active" || isViewEntryClosed(campaign)) continue;
        s.viewSnapshots.push(confirmedSnapshot(id, views, at, "job"));
        sub.views = views;
        sub.updatedAt = at;
      }
    });
    updated = pending.size;
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
  try {
    revalidatePath("/dashboard/clipper");
    revalidatePath("/dashboard/brand");
  } catch {
    // revalidatePath is a no-op outside a Next request.
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
