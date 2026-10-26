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

/** Settled, pool settled, closed, or already completed campaigns do not take further view counts. */
export function isViewEntryClosed(campaign: {
  status: string;
  settledAt?: string | null;
  poolSettledAt?: string | null;
  closedAt: string | null;
}): boolean {
  return Boolean(
    campaign.settledAt || campaign.poolSettledAt || campaign.closedAt || campaign.status === "completed",
  );
}

export type AdminViewWrite = {
  submissionId: string;
  views: number;
  likes?: number | null;
  comments?: number | null;
  note?: string | null;
  screenshotPath?: string | null;
};

export function assertAdminViewWritable(store: DatabaseStore, actor: ViewActor, input: AdminViewWrite) {
  if (!actor.roles.includes("admin")) throw new Error("Admin only.");

  const submission = store.submissions.find((item) => item.id === input.submissionId);
  if (!submission) throw new Error("Clip not found.");
  // Forfeited wins over "not approved": a clawed or upheld clip must not be counted again.
  if (submission.payoutState === "clawed_back" || submission.fraudState === "upheld") {
    throw new Error("This clip was forfeited.");
  }
  if (submission.status !== "approved") throw new Error("Approve the clip before counting views.");
  const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
  if (!campaign) throw new Error("Campaign missing.");
  if (isViewEntryClosed(campaign)) throw new Error(SETTLED_CAMPAIGN_ERROR);
  if (input.views < submission.views) throw new Error(VIEWS_BACKWARDS_ERROR);
  return { submission, campaign };
}

function writeConfirmedAdminView(
  store: DatabaseStore,
  actor: ViewActor,
  input: AdminViewWrite,
  nowMs: number,
): { campaignId: string; stopped: boolean; reservedDelta: number } {
  const submission = store.submissions.find((item) => item.id === input.submissionId);
  const campaign = submission
    ? store.campaigns.find((item) => item.id === submission.campaignId)
    : undefined;
  if (!submission || !campaign) throw new Error("Clip not found.");

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
  assertAdminViewWritable(store, actor, input);
  return writeConfirmedAdminView(store, actor, input, nowMs);
}

export type CreatorViewConfirm = {
  snapshotId: string;
  submissionId: string;
  views: number;
  likes?: number | null;
  comments?: number | null;
  note?: string | null;
};

/**
 * Save every row in one store write. Each row is checked before the first
 * snapshot or wallet change, so one lower count refuses the whole batch.
 * The writes then use the same path as a single admin save.
 */
export function saveBulkViewsInStore(
  store: DatabaseStore,
  actor: ViewActor,
  entries: AdminViewWrite[],
  nowMs: number,
): { stopped: number; campaignIds: string[] } {
  if (!actor.roles.includes("admin")) throw new Error("Admin only.");
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.submissionId)) throw new Error("Each clip can only be saved once.");
    ids.add(entry.submissionId);
  }
  for (const entry of entries) assertAdminViewWritable(store, actor, entry);

  const campaignIds = new Set<string>();
  let stopped = 0;
  for (const entry of entries) {
    const result = writeConfirmedAdminView(store, actor, entry, nowMs);
    campaignIds.add(result.campaignId);
    if (result.stopped) stopped += 1;
  }
  return { stopped, campaignIds: [...campaignIds] };
}

export async function saveBulkViewsForActor(
  actor: ViewActor,
  entries: AdminViewWrite[],
  nowMs = Date.now(),
): Promise<{ ok: true; stopped: number; campaignIds: string[] } | { ok: false; error: string }> {
  if (!actor.roles.includes("admin")) return { ok: false, error: "Admin only." };
  try {
    let saved = { stopped: 0, campaignIds: [] as string[] };
    await updateStore((store) => {
      saved = saveBulkViewsInStore(store, actor, entries, nowMs);
    });
    return { ok: true, stopped: saved.stopped, campaignIds: saved.campaignIds };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the counts." };
  }
}

/** Confirm a creator report. Only an approved clip can be confirmed. */
export function confirmCreatorViewInStore(
  store: DatabaseStore,
  actor: ViewActor,
  input: CreatorViewConfirm,
  nowMs: number,
): { campaignId: string; stopped: boolean } {
  if (!actor.roles.includes("admin")) throw new Error("Admin only.");
  const snap = store.viewSnapshots.find((item) => item.id === input.snapshotId);
  if (!snap || snap.status !== "pending" || snap.submissionId !== input.submissionId) {
    throw new Error("That report is no longer waiting.");
  }
  const result = commitAdminViewCount(
    store,
    actor,
    {
      submissionId: input.submissionId,
      views: input.views,
      likes: input.likes,
      comments: input.comments,
      note: input.note?.trim() ? input.note : snap.note,
      screenshotPath: snap.screenshotPath,
    },
    nowMs,
  );
  return { campaignId: result.campaignId, stopped: result.stopped };
}

export async function confirmCreatorViewForActor(
  actor: ViewActor,
  input: CreatorViewConfirm,
  nowMs = Date.now(),
): Promise<{ ok: true; stopped: boolean; campaignId: string } | { ok: false; error: string }> {
  if (!actor.roles.includes("admin")) return { ok: false, error: "Admin only." };
  let saved = { campaignId: "", stopped: false };
  try {
    await updateStore((store) => {
      saved = confirmCreatorViewInStore(store, actor, input, nowMs);
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not confirm the count." };
  }
  return { ok: true, stopped: saved.stopped, campaignId: saved.campaignId };
}

/**
 * Onboarding view entry. Refuses a forfeited clip and a settled, closed,
 * or completed campaign before any snapshot or wallet write.
 * creditedCents is the creator pending change.
 */
export function recordSubmissionViewsInStore(
  store: DatabaseStore,
  actor: ViewActor,
  input: { submissionId: string; views: number },
  nowMs: number,
): { campaignId: string; creditedCents: number } {
  const { submission } = assertAdminViewWritable(store, actor, input);

  const pendingBefore = store.wallets.find((row) => row.userId === submission.clipperId)?.pendingCents ?? 0;
  const at = new Date(nowMs).toISOString();
  const previousViews = submission.views;
  for (const snap of store.viewSnapshots) {
    if (snap.submissionId === submission.id && snap.status === "pending") snap.status = "replaced";
  }
  store.viewSnapshots.push({
    id: newId(),
    submissionId: submission.id,
    views: input.views,
    likes: submission.likes,
    comments: submission.comments,
    note: null,
    screenshotPath: null,
    recordedAt: at,
    checkedBy: actor.id,
    actorEmail: actor.email,
    previousViews,
    source: "admin",
    status: "confirmed",
  });
  applyConfirmedViews(store, submission.id, input.views, submission.likes, submission.comments, nowMs);
  const fresh = store.submissions.find((item) => item.id === submission.id);
  if (fresh) applyFraudScore(store, fresh, nowMs);
  const pendingAfter = store.wallets.find((row) => row.userId === submission.clipperId)?.pendingCents ?? 0;
  return { campaignId: submission.campaignId, creditedCents: pendingAfter - pendingBefore };
}

/** Simple admin total. An equal count is a no-op. A closed campaign is refused before any write. */
export function setManualViewsInStore(
  store: DatabaseStore,
  actor: ViewActor,
  input: { submissionId: string; views: number },
  nowMs: number,
): { campaignId: string } {
  const { submission } = assertAdminViewWritable(store, actor, input);
  if (input.views === submission.views) return { campaignId: submission.campaignId };
  const result = writeConfirmedAdminView(store, actor, input, nowMs);
  return { campaignId: result.campaignId };
}

export async function setManualViewsForActor(
  actor: ViewActor,
  input: { submissionId: string; views: number },
  nowMs = Date.now(),
): Promise<{ ok: true; campaignId: string } | { ok: false; error: string }> {
  if (!actor.roles.includes("admin")) return { ok: false, error: "Admin only." };
  let campaignId = "";
  try {
    await updateStore((store) => {
      campaignId = setManualViewsInStore(store, actor, input, nowMs).campaignId;
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the count." };
  }
  return { ok: true, campaignId };
}

export async function recordSubmissionViewsForActor(
  actor: ViewActor,
  input: { submissionId: string; views: number },
  nowMs = Date.now(),
): Promise<{ ok: true; creditedCents: number; campaignId: string } | { ok: false; error: string }> {
  if (!actor.roles.includes("admin")) return { ok: false, error: "Admin only." };
  let saved = { campaignId: "", creditedCents: 0 };
  try {
    await updateStore((store) => {
      saved = recordSubmissionViewsInStore(store, actor, input, nowMs);
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not record views." };
  }
  return { ok: true, creditedCents: saved.creditedCents, campaignId: saved.campaignId };
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
