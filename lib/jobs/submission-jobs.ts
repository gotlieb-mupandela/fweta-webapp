import "server-only";

import { revalidatePath } from "next/cache";

import { creditSubmissionEarnings } from "@/lib/campaigns/earnings";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { Campaign, Submission, ViewSnapshot } from "@/lib/db/types";
import { fetchVideoViewsFromApify, isApifyConfigured } from "@/lib/social/apify";

/** Closed, settled, completed, or forfeited clips do not take new job views. */
function jobViewWriteBlocked(
  submission: Pick<Submission, "fraudState" | "payoutState">,
  campaign: Pick<Campaign, "closedAt" | "poolSettledAt" | "status"> | undefined,
): boolean {
  if (!campaign) return true;
  if (campaign.closedAt || campaign.poolSettledAt || campaign.status === "completed") return true;
  if (submission.fraudState === "upheld" || submission.payoutState === "clawed_back") return true;
  return false;
}

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
 * Poll approved submissions. The cron route /api/jobs/poll-views calls this.
 * Uses Apify when APIFY_API_TOKEN is set. Otherwise simulates view growth.
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
      if (!campaign || campaign.status !== "active") continue;
      if (campaign.budgetSpentCents >= campaign.budgetTotalCents) continue;

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
  // whole store and timed out.
  let updated = 0;
  if (pending.size > 0) {
    const at = nowIso();
    await updateStore((s) => {
      let wrote = 0;
      for (const [id, views] of pending) {
        const sub = s.submissions.find((x) => x.id === id);
        if (!sub) continue;
        // Re-check inside the transaction; skip regressions per-record.
        if (views <= sub.views) continue;
        const campaign = s.campaigns.find((item) => item.id === sub.campaignId);
        if (jobViewWriteBlocked(sub, campaign)) continue;
        s.viewSnapshots.push(confirmedSnapshot(id, views, at, "job"));
        sub.views = views;
        sub.updatedAt = at;
        wrote += 1;
      }
      updated = wrote;
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

export async function recalculateEarningsJob() {
  const store = await readStore();
  const ids = store.submissions.filter((s) => s.status === "approved").map((s) => s.id);
  let credited = 0;

  // Single write per submission (was two: wallet then record). Math is
  // recomputed inside the transaction from current budget so concurrent
  // runs can't overspend the campaign.
  for (const id of ids) {
    let delta = 0;
    try {
      await updateStore((s) => {
        delta = creditSubmissionEarnings(s, id);
      });
    } catch {
      // One bad submission (e.g. wallet invariant) skips; rest still credit.
      continue;
    }
    credited += delta;
  }

  // Earnings are already stored. Next throws this call when there is no request cache.
  try {
    revalidatePath("/dashboard/clipper");
    revalidatePath("/dashboard/brand");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("static generation store missing")) throw error;
  }
  return { creditedCents: credited };
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

/** Manual view credits already happen when an admin saves a count. This job repeats that math. */
export async function settleRewardsJob(asOf?: string) {
  void asOf;
  const result = await recalculateEarningsJob();
  return {
    reservedCents: 0,
    releasedCents: result.creditedCents,
    clawedCents: 0,
    creditedCents: result.creditedCents,
  };
}
