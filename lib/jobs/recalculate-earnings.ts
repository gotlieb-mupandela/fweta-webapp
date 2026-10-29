import { updateStore } from "@/lib/db/store";
import { applyConfirmedViews, markApprovedForPayout } from "@/lib/rewards/earnings";

/** Recompute reserves from confirmed views. Does not credit Available ahead of the hold. */
export async function recalculateEarnings(campaignIds?: string[]) {
  let credited = 0;
  const nowMs = Date.now();
  await updateStore((store) => {
    const ids = store.submissions
      .filter((submission) => submission.status === "approved" && (!campaignIds || campaignIds.includes(submission.campaignId)))
      .map((submission) => submission.id);
    for (const id of ids) {
      const sub = store.submissions.find((item) => item.id === id);
      if (!sub) continue;
      const camp = store.campaigns.find((item) => item.id === sub.campaignId);
      if (camp && !sub.approvedAt) markApprovedForPayout(sub, camp, nowMs);
      const before = sub.reservedCents + sub.releasedCents;
      try {
        applyConfirmedViews(store, id, sub.views, sub.likes, sub.comments, nowMs);
      } catch {
        continue;
      }
      const fresh = store.submissions.find((item) => item.id === id);
      if (fresh) credited += Math.max(0, fresh.reservedCents + fresh.releasedCents - before);
    }
  });
  return { creditedCents: credited };
}
