"use server";

import { revalidatePath } from "next/cache";

import { readStore, updateStore } from "@/lib/db/store";
import { finalizeCampaign, settleSubmission } from "@/lib/rewards/earnings";

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
  revalidatePath("/campaigns");
}

/**
 * View counts are entered by an admin. This does not call a provider and does not move money.
 * `asOf` is ignored. Kept so older cron callers fail closed.
 */
export async function pollSubmissionViewsJob(asOf?: string) {
  void asOf;
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

export async function recalculateEarningsJob() {
  const result = await settleRewardsJob();
  return { creditedCents: result.reservedCents, ...result };
}

export async function budgetAlertsJob() {
  const store = await readStore();
  const alerts = store.campaigns
    .filter((c) => c.status === "active" && c.payModel !== "pool")
    .filter((c) => c.budgetTotalCents > 0 && c.budgetSpentCents / c.budgetTotalCents >= 0.8)
    .map((c) => ({
      campaignId: c.id,
      title: c.title,
      brandId: c.brandId,
      spentRatio: c.budgetSpentCents / c.budgetTotalCents,
    }));
  return { alerts };
}
