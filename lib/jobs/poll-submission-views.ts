import { newId, updateStore, readStore } from "@/lib/db/store";
import { applyConfirmedViews, markApprovedForPayout } from "@/lib/rewards/earnings";
import { fetchVideoViewsFromApify, isApifyConfigured } from "@/lib/social/apify";

/**
 * Fetches view counts only when Apify is configured.
 * Earnings go through the reserve. This module is not a server action.
 */
export async function pollSubmissionViews(campaignIds?: string[]) {
  if (!isApifyConfigured()) {
    return { updated: 0, failed: 0, mode: "off" as const, creditedCents: 0 };
  }

  const store = await readStore();
  const approved = store.submissions.filter(
    (submission) =>
      submission.status === "approved" && (!campaignIds || campaignIds.includes(submission.campaignId)),
  );
  let failed = 0;
  const pending = new Map<string, number>();

  for (const submission of approved) {
    try {
      const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
      if (!campaign || campaign.status !== "active") continue;
      if (campaign.budgetSpentCents >= campaign.budgetTotalCents) continue;
      let fetched: number | null;
      try {
        fetched = await fetchVideoViewsFromApify(submission.postUrl);
      } catch {
        failed += 1;
        continue;
      }
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

  let credited = 0;
  if (pending.size > 0) {
    const nowMs = Date.now();
    await updateStore((draft) => {
      for (const [id, views] of pending) {
        const sub = draft.submissions.find((item) => item.id === id);
        if (!sub || views <= sub.views) continue;
        const camp = draft.campaigns.find((item) => item.id === sub.campaignId);
        if (camp && sub.status === "approved" && !sub.approvedAt) {
          markApprovedForPayout(sub, camp, nowMs);
        }
        const before = sub.reservedCents + sub.releasedCents;
        draft.viewSnapshots.push({
          id: newId(),
          submissionId: id,
          views,
          likes: null,
          comments: null,
          note: null,
          screenshotPath: null,
          recordedAt: new Date(nowMs).toISOString(),
          checkedBy: null,
          source: "job",
          status: "confirmed",
        });
        applyConfirmedViews(draft, id, views, null, null, nowMs);
        const fresh = draft.submissions.find((item) => item.id === id);
        if (fresh) credited += Math.max(0, fresh.reservedCents + fresh.releasedCents - before);
      }
    });
  }

  return {
    updated: pending.size,
    failed,
    mode: "apify" as const,
    creditedCents: credited,
  };
}
