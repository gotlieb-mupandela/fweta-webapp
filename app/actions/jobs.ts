"use server";

import { revalidatePath } from "next/cache";

import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { adjustWallet } from "@/lib/wallet/ledger";

/**
 * Phase 7 automation — callable via /api/jobs/poll-views or cron.
 * Simulates social view growth for approved submissions and credits CPM earnings.
 */
export async function pollSubmissionViewsJob() {
  const store = await readStore();
  const approved = store.submissions.filter((s) => s.status === "approved");
  let updated = 0;

  for (const submission of approved) {
    const campaign = store.campaigns.find((c) => c.id === submission.campaignId);
    if (!campaign || campaign.status !== "active") continue;
    if (campaign.budgetSpentCents >= campaign.budgetTotalCents) continue;

    const growth = Math.floor(200 + Math.random() * 1800);
    const newViews = submission.views + growth;

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
  return { updated, ...earnings };
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
