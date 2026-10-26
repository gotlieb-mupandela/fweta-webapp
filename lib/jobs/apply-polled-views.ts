import { newId } from "@/lib/db/store";
import type { DatabaseStore, ViewSnapshot } from "@/lib/db/types";
import { isViewEntryClosed } from "@/lib/rewards/view-entry";

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
 * Write polled totals that still pass the view guards.
 * Returns how many submissions were written. Skipped rows are not counted.
 * The guards match the poll job: approved, not forfeited, a higher total,
 * and a campaign that is still active and open.
 */
export function applyPolledViews(
  store: DatabaseStore,
  pending: Iterable<[string, number]>,
  at: string,
): number {
  let written = 0;
  for (const [id, views] of pending) {
    const sub = store.submissions.find((x) => x.id === id);
    if (!sub || sub.status !== "approved") continue;
    if (sub.payoutState === "clawed_back" || sub.fraudState === "upheld") continue;
    // Re-check inside the transaction; skip regressions per-record.
    if (views <= sub.views) continue;
    const campaign = store.campaigns.find((item) => item.id === sub.campaignId);
    if (!campaign || campaign.status !== "active" || isViewEntryClosed(campaign)) continue;
    store.viewSnapshots.push(confirmedSnapshot(id, views, at, "job"));
    sub.views = views;
    sub.updatedAt = at;
    written += 1;
  }
  return written;
}
