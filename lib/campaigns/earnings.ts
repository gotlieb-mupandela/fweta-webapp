import type { DatabaseStore } from "@/lib/db/types";
import { applyConfirmedViews, markApprovedForPayout } from "@/lib/rewards/earnings";

/**
 * CPM earnings go to the reserve (pending), then the 7 day window and 3 day hold.
 * This used to credit Available immediately, which paid a clip twice when an admin
 * later saved a view count.
 */
export function creditSubmissionEarnings(store: DatabaseStore, submissionId: string): number {
  const submission = store.submissions.find((item) => item.id === submissionId);
  if (!submission || submission.status !== "approved") return 0;
  const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
  if (!campaign) return 0;

  const nowMs = Date.now();
  if (!submission.approvedAt) markApprovedForPayout(submission, campaign, nowMs);
  const wallet = store.wallets.find((row) => row.userId === submission.clipperId);
  const pendingBefore = wallet?.pendingCents ?? 0;
  applyConfirmedViews(
    store,
    submissionId,
    submission.views,
    submission.likes,
    submission.comments,
    nowMs,
  );
  const pendingAfter = store.wallets.find((row) => row.userId === submission.clipperId)?.pendingCents ?? 0;
  return Math.max(0, pendingAfter - pendingBefore);
}
