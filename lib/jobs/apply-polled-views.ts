import { newId } from "@/lib/db/store";
import type { DatabaseStore, ViewSnapshot } from "@/lib/db/types";
import { assertAdminViewWritable, type ViewActor } from "@/lib/rewards/view-entry";

/**
 * The poll is not an admin form. This actor only lets the shared guard run
 * its view rules. Snapshots stay source "job" with no admin id.
 */
const pollViewActor: ViewActor = {
  id: "poll-views",
  email: "poll-views@fweta.local",
  roles: ["admin"],
};

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
 * Shared view-write decision for a polled total.
 * Refuses a missing clip, a forfeited clip, an unapproved clip, a campaign
 * that is missing, closed, settled, pool settled, or completed, and a lower
 * total. Also refuses a campaign that is no longer active.
 * An equal total is allowed only when ignoreEqualTotal is set, so the fetch
 * step can ask about the current total without treating it as a regression.
 */
export function polledViewWriteBlocked(
  store: DatabaseStore,
  submissionId: string,
  views: number,
  options?: { ignoreEqualTotal?: boolean },
): boolean {
  try {
    assertAdminViewWritable(store, pollViewActor, { submissionId, views });
  } catch {
    return true;
  }
  const submission = store.submissions.find((item) => item.id === submissionId);
  const campaign = submission
    ? store.campaigns.find((item) => item.id === submission.campaignId)
    : undefined;
  if (!submission || submission.status !== "approved" || !campaign || campaign.status !== "active") return true;
  if (!options?.ignoreEqualTotal && views <= submission.views) return true;
  return false;
}

/**
 * Write polled totals that still pass the shared view guard.
 * Returns how many submissions were written. Skipped rows are not counted.
 * Call this inside the same store update that holds the latest clip and
 * campaign, so a status change after the read does not get a view write.
 */
export function applyPolledViews(
  store: DatabaseStore,
  pending: Iterable<[string, number]>,
  at: string,
): number {
  let written = 0;
  for (const [id, views] of pending) {
    const sub = store.submissions.find((x) => x.id === id);
    if (!sub) continue;
    if (polledViewWriteBlocked(store, id, views)) continue;
    store.viewSnapshots.push(confirmedSnapshot(id, views, at, "job"));
    sub.views = views;
    sub.updatedAt = at;
    written += 1;
  }
  return written;
}
