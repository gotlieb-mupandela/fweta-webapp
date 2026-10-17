"use server";

import { revalidatePath } from "next/cache";

import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { deliverBudgetAlerts } from "@/lib/notifications/events";
import { applyConfirmedViews, finalizeCampaign, settleSubmission } from "@/lib/rewards/earnings";
import { fetchVideoViewsFromApify, isApifyConfigured } from "@/lib/social/apify";

function resolveNow(asOf?: string): number {
  if (asOf && process.env.NODE_ENV !== "production") {
    const parsed = Date.parse(asOf);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

function revalidateMoney() {
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/clipper/earnings");
  revalidatePath("/dashboard/clipper/submissions");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/admin/views");
  revalidatePath("/campaigns");
}

/**
 * Fetches platform view counts when Apify is configured, then settles earnings
 * from those counts. Without Apify, view checks stay manual and this job
 * does not invent counts.
 */
export async function pollSubmissionViewsJob(asOf?: string) {
  const useApify = isApifyConfigured();
  if (!useApify) {
    return {
      updated: 0,
      failed: 0,
      mode: "manual" as const,
      reservedCents: 0,
      releasedCents: 0,
      clawedCents: 0,
      creditedCents: 0,
      error: "View checks are manual. Earnings update when an admin saves a count.",
    };
  }

  const store = await readStore();
  const approved = store.submissions.filter((s) => s.status === "approved");
  let failed = 0;
  const pending = new Map<string, number>();

  for (const submission of approved) {
    try {
      const campaign = store.campaigns.find((c) => c.id === submission.campaignId);
      if (!campaign || campaign.status !== "active") continue;
      if (campaign.budgetSpentCents >= campaign.budgetTotalCents) continue;
      const fetched = await fetchVideoViewsFromApify(submission.postUrl);
      if (fetched == null) {
        failed += 1;
        continue;
      }
      const newViews = Math.max(fetched, submission.views);
      if (newViews === submission.views) continue;
      pending.set(submission.id, newViews);
    } catch {
      failed += 1;
    }
  }

  let updated = 0;
  if (pending.size > 0) {
    const nowMs = resolveNow(asOf);
    const at = nowIso();
    await updateStore((s) => {
      for (const [id, views] of pending) {
        const sub = s.submissions.find((x) => x.id === id);
        if (!sub || views < sub.views) continue;
        for (const snap of s.viewSnapshots) {
          if (snap.submissionId === id && snap.status === "pending") snap.status = "replaced";
        }
        s.viewSnapshots.push({
          id: newId(),
          submissionId: id,
          views,
          likes: sub.likes,
          comments: sub.comments,
          note: "Fetched from the platform.",
          screenshotPath: null,
          recordedAt: at,
          checkedBy: null,
          source: "bulk",
          status: "confirmed",
        });
        applyConfirmedViews(s, id, views, sub.likes, sub.comments, nowMs);
      }
    });
    updated = pending.size;
  }

  const earnings = await recalculateEarningsJob(asOf);
  return {
    updated,
    failed,
    mode: "apify" as const,
    ...earnings,
  };
}

/**
 * Ledger-only settlement. Closes ended campaigns, splits a pool, and releases holds
 * from counts already confirmed. Does not fetch views.
 */
export async function settleRewardsJob(asOf?: string) {
  const nowMs = resolveNow(asOf);
  let reserved = 0;
  let released = 0;
  let clawed = 0;
  await updateStore((s) => {
    for (const campaign of s.campaigns) finalizeCampaign(s, campaign, nowMs);
    for (const sub of s.submissions) {
      if (sub.status !== "approved") continue;
      const result = settleSubmission(s, sub.id, nowMs, sub.postLive, sub.postLive != null);
      reserved += result.reserved;
      released += result.released;
      clawed += result.clawed;
    }
  });
  revalidateMoney();
  return { reservedCents: reserved, releasedCents: released, clawedCents: clawed };
}

export async function recalculateEarningsJob(asOf?: string) {
  const result = await settleRewardsJob(asOf);
  await budgetAlertsJob();
  return {
    creditedCents: result.reservedCents + result.releasedCents,
    ...result,
  };
}

export async function budgetAlertsJob() {
  const alerts = await deliverBudgetAlerts();
  return { alerts };
}
