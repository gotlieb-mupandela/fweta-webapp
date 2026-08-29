"use server";

import { revalidatePath } from "next/cache";

import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { fetchVideoViewsFromApify, isApifyConfigured } from "@/lib/social/apify";
import { adjustWallet } from "@/lib/wallet/ledger";

/**
 * Phase 7 automation — callable via /api/jobs/poll-views or cron.
 * Uses Apify when APIFY_API_TOKEN is set; otherwise simulates view growth.
 */
export async function pollSubmissionViewsJob() {
  const store = await readStore();
  const approved = store.submissions.filter((s) => s.status === "approved");
  const useApify = isApifyConfigured();
  let updated = 0;
  let failed = 0;

  for (const submission of approved) {
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
        newViews = fetched;
      } catch {
        failed += 1;
        continue;
      }
    } else {
      const growth = Math.floor(200 + Math.random() * 1800);
      newViews = submission.views + growth;
    }

    if (newViews === submission.views) continue;

    await updateStore((s) => {
      s.viewSnapshots.push({
        id: newId(),
        submissionId: submission.id,
        views: newViews,
        recordedAt: nowIso(),
      });
      const sub = s.submissions.find((x) => x.id === submission.id);
      if (sub) {
        sub.views = newViews;
        sub.updatedAt = nowIso();
      }
    });
    updated += 1;
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
  let credited = 0;

  for (const submission of store.submissions.filter((s) => s.status === "approved")) {
    const campaign = store.campaigns.find((c) => c.id === submission.campaignId);
    if (!campaign) continue;

    // CPM math: earnings = views / 1000 * cpm, capped per submission and remaining budget
    const raw = Math.floor((submission.views / 1000) * campaign.cpmCents);
    const cappedByVideo = Math.min(raw, campaign.maxPayoutPerSubmissionCents);
    const remainingBudget = campaign.budgetTotalCents - campaign.budgetSpentCents;
    const targetEarnings = Math.min(cappedByVideo, remainingBudget + submission.earningsCents);
    const delta = targetEarnings - submission.earningsCents;
    if (delta <= 0) continue;

    await adjustWallet({
      userId: submission.clipperId,
      availableDelta: delta,
      type: "credit",
      reason: `Campaign earnings · ${campaign.title}`,
      referenceType: "campaign_earning",
      referenceId: submission.id,
    });

    await updateStore((s) => {
      const sub = s.submissions.find((x) => x.id === submission.id);
      const camp = s.campaigns.find((c) => c.id === campaign.id);
      if (sub) {
        sub.earningsCents = targetEarnings;
        sub.updatedAt = nowIso();
      }
      if (camp) {
        camp.budgetSpentCents += delta;
        if (camp.budgetSpentCents >= camp.budgetTotalCents) {
          camp.status = "completed";
        }
        camp.updatedAt = nowIso();
      }
    });
    credited += delta;
  }

  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/brand");
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
