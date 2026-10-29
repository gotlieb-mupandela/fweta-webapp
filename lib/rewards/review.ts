import { newId } from "@/lib/db/store";
import type { DatabaseStore, ViewSnapshot } from "@/lib/db/types";
import { applyConfirmedViews, markApprovedForPayout } from "@/lib/rewards/earnings";

export type ClipReviewInput = {
  status: "approved" | "rejected" | "flagged";
  reviewNote?: string | null;
  views?: number | null;
};

function snapshot(submissionId: string, views: number, at: string): ViewSnapshot {
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
    source: "admin",
    status: "confirmed",
  };
}

/** Approve, reject, or flag a clip. Approval reserves earnings. It does not credit Available. */
export function applyClipReview(
  store: DatabaseStore,
  submissionId: string,
  input: ClipReviewInput,
  nowMs: number,
): void {
  const sub = store.submissions.find((item) => item.id === submissionId);
  if (!sub) throw new Error("Not found.");
  const camp = store.campaigns.find((item) => item.id === sub.campaignId);
  if (!camp) throw new Error("Campaign missing.");
  if (input.status === "approved" && (sub.status === "rejected" || sub.payoutState === "clawed_back")) {
    throw new Error("A rejected clip cannot be approved.");
  }

  const at = new Date(nowMs).toISOString();
  sub.reviewNote = input.reviewNote ?? null;
  sub.updatedAt = at;
  if (input.status !== "approved") {
    sub.status = input.status;
    return;
  }

  sub.status = "approved";
  if (!sub.approvedAt) markApprovedForPayout(sub, camp, nowMs);
  if (input.views == null) return;
  store.viewSnapshots.push(snapshot(sub.id, input.views, at));
  applyConfirmedViews(store, sub.id, input.views, null, null, nowMs);
}

/** Record a confirmed view total on an approved clip and reserve any unpaid amount. */
export function recordApprovedViews(
  store: DatabaseStore,
  submissionId: string,
  views: number,
  nowMs: number,
): number {
  const sub = store.submissions.find((item) => item.id === submissionId);
  if (!sub || sub.status !== "approved") throw new Error("Approve the clip before recording views.");
  if (sub.payoutState === "clawed_back") throw new Error("This clip was forfeited.");
  const camp = store.campaigns.find((item) => item.id === sub.campaignId);
  if (!camp) throw new Error("Campaign missing.");
  if (!sub.approvedAt) markApprovedForPayout(sub, camp, nowMs);
  const before = sub.reservedCents + sub.releasedCents;
  const at = new Date(nowMs).toISOString();
  store.viewSnapshots.push(snapshot(sub.id, views, at));
  applyConfirmedViews(store, sub.id, views, sub.likes, sub.comments, nowMs);
  return Math.max(0, sub.reservedCents + sub.releasedCents - before);
}
