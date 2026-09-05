"use server";

import { revalidatePath } from "next/cache";

import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { fetchVideoViewsFromApify, isApifyConfigured } from "@/lib/social/apify";
import { applyWalletDelta } from "@/lib/wallet/ledger";

/**
 * Phase 7 automation — callable via /api/jobs/poll-views or cron.
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

  // Phase 2: single atomic write for all view updates (was N sequential writes,
  // each triggering a full Supabase save — slow and timeout-prone).
  let updated = 0;
  if (pending.size > 0) {
    const at = nowIso();
    await updateStore((s) => {
      for (const [id, views] of pending) {
        const sub = s.submissions.find((x) => x.id === id);
        if (!sub) continue;
        // Re-check inside the transaction; skip regressions per-record.
        if (views <= sub.views) continue;
        s.viewSnapshots.push({ id: newId(), submissionId: id, views, recordedAt: at });
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
        const sub = s.submissions.find((x) => x.id === id);
        if (!sub || sub.status !== "approved") return;
        const camp = s.campaigns.find((c) => c.id === sub.campaignId);
        if (!camp) return;

        // CPM math: earnings = views / 1000 * cpm, capped per submission and remaining budget
        const raw = Math.floor((sub.views / 1000) * camp.cpmCents);
        const cappedByVideo = Math.min(raw, camp.maxPayoutPerSubmissionCents);
        const remainingBudget = camp.budgetTotalCents - camp.budgetSpentCents;
        const targetEarnings = Math.min(cappedByVideo, remainingBudget + sub.earningsCents);
        const d = targetEarnings - sub.earningsCents;
        if (d <= 0) return;

        applyWalletDelta(s, {
          userId: sub.clipperId,
          availableDelta: d,
          type: "credit",
          reason: `Campaign earnings · ${camp.title}`,
          referenceType: "campaign_earning",
          referenceId: sub.id,
        });
        sub.earningsCents = targetEarnings;
        sub.updatedAt = nowIso();
        camp.budgetSpentCents += d;
        if (camp.budgetSpentCents >= camp.budgetTotalCents) {
          camp.status = "completed";
        }
        camp.updatedAt = nowIso();
        delta = d;
      });
    } catch {
      // One bad submission (e.g. wallet invariant) skips; rest still credit.
      continue;
    }
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
