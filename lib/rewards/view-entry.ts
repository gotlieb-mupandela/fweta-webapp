import { newId, updateStore } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { pushAudit } from "@/lib/marketplace/audit";
import { manualViewsSchema } from "@/lib/validations/submission";
import { applyConfirmedViews } from "@/lib/rewards/earnings";
import { applyFraudScore } from "@/lib/rewards/fraud";

export type ViewActor = {
  id: string;
  email: string;
  roles: readonly string[];
};

export const SETTLED_CAMPAIGN_ERROR = "This campaign is already settled. Further views are not paid.";
export const VIEWS_BACKWARDS_ERROR = "Views cannot go backwards.";

export type AdminViewWrite = {
  submissionId: string;
  views: number;
  likes?: number | null;
  comments?: number | null;
  note?: string | null;
  screenshotPath?: string | null;
};

/**
 * Admin view entry. Checks and the wallet write happen on the store passed in,
 * which the action mutates inside one updateStore call.
 */
export function commitAdminViewCount(
  store: DatabaseStore,
  actor: ViewActor,
  input: AdminViewWrite,
  nowMs: number,
): { campaignId: string; stopped: boolean; reservedDelta: number } {
  if (!actor.roles.includes("admin")) throw new Error("Admin only.");

  const submission = store.submissions.find((item) => item.id === input.submissionId);
  if (!submission) throw new Error("Clip not found.");
  if (submission.status !== "approved") throw new Error("Approve the clip before counting views.");
  if (submission.payoutState === "clawed_back" || submission.fraudState === "upheld") {
    throw new Error("This clip was forfeited.");
  }
  const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
  if (!campaign) throw new Error("Campaign missing.");
  if (campaign.settledAt || campaign.closedAt) throw new Error(SETTLED_CAMPAIGN_ERROR);
  if (input.views < submission.views) throw new Error(VIEWS_BACKWARDS_ERROR);

  const previous = submission.views;
  const reservedBefore = submission.reservedCents;
  const at = new Date(nowMs).toISOString();
  const reason = input.note?.trim() ? input.note.trim() : "Admin view entry";
  for (const snap of store.viewSnapshots) {
    if (snap.submissionId === submission.id && snap.status === "pending") snap.status = "replaced";
  }
  store.viewSnapshots.push({
    id: newId(),
    submissionId: submission.id,
    views: input.views,
    likes: input.likes ?? null,
    comments: input.comments ?? null,
    note: input.note?.trim() ? input.note.trim() : null,
    screenshotPath: input.screenshotPath ?? null,
    recordedAt: at,
    checkedBy: actor.id,
    actorEmail: actor.email,
    previousViews: previous,
    source: "admin",
    status: "confirmed",
  });
  pushAudit(store, {
    actorId: actor.id,
    action: previous === input.views ? "views.save" : "views.correct",
    summary: `${actor.email} set views from ${previous} to ${input.views}. ${reason}`,
    targetType: "submission",
    targetId: submission.id,
  });

  const wasCompleted = campaign.status === "completed";
  applyConfirmedViews(
    store,
    submission.id,
    input.views,
    input.likes ?? submission.likes,
    input.comments ?? submission.comments,
    nowMs,
  );
  const fresh = store.submissions.find((item) => item.id === submission.id);
  if (fresh) applyFraudScore(store, fresh, nowMs);
  const after = store.campaigns.find((item) => item.id === submission.campaignId);
  return {
    campaignId: submission.campaignId,
    stopped: after?.status === "completed" && !wasCompleted,
    reservedDelta: (fresh?.reservedCents ?? reservedBefore) - reservedBefore,
  };
}

export async function recordCheckedViewsForActor(
  actor: ViewActor,
  raw: unknown,
  nowMs = Date.now(),
): Promise<{ ok: true; creditedCents: number; campaignId: string } | { ok: false; error: string }> {
  if (!actor.roles.includes("admin")) return { ok: false, error: "Admin only." };
  const parsed = manualViewsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter a whole view count." };

  let credited = 0;
  let campaignId = "";
  try {
    await updateStore((store) => {
      const result = commitAdminViewCount(
        store,
        actor,
        { submissionId: parsed.data.submissionId, views: parsed.data.views },
        nowMs,
      );
      credited = Math.max(0, result.reservedDelta);
      campaignId = result.campaignId;
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record views." };
  }
  return { ok: true, creditedCents: credited, campaignId };
}

export async function saveAdminViewForActor(
  actor: ViewActor,
  input: AdminViewWrite,
  nowMs = Date.now(),
): Promise<
  | { ok: true; stopped: boolean; message: string; campaignId: string }
  | { ok: false; error: string }
> {
  if (!actor.roles.includes("admin")) return { ok: false, error: "Admin only." };
  let saved = { campaignId: "", stopped: false };
  try {
    await updateStore((store) => {
      const result = commitAdminViewCount(store, actor, input, nowMs);
      saved = { campaignId: result.campaignId, stopped: result.stopped };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the count." };
  }
  return {
    ok: true,
    stopped: saved.stopped,
    campaignId: saved.campaignId,
    message: saved.stopped
      ? "Count saved. Earnings updated, and the campaign stopped because the budget ran out."
      : "Count saved. Earnings, wallet, budget, and leaderboard are updated.",
  };
}
