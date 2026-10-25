import { newId, updateStore } from "@/lib/db/store";
import type { DatabaseStore } from "@/lib/db/types";
import { clawbackSubmission, markApprovedForPayout } from "@/lib/rewards/earnings";
import { submissionReviewSchema } from "@/lib/validations/submission";

export type ReviewActor = { id: string; roles: readonly string[] };

export type ReviewDecision = {
  status: "approved" | "rejected" | "flagged";
  reviewNote?: string | null;
};

/**
 * Brand approve / reject / flag. View counts in the payload are ignored.
 * Reject claws held money back once when the clip is approved or still has
 * a reserve, including a clip that was flagged after approval. A second
 * reject sees the rejected status and does not move money again.
 * Must run inside updateStore.
 */
export function reviewSubmissionInStore(
  store: DatabaseStore,
  actor: ReviewActor,
  submissionId: string,
  input: ReviewDecision,
  nowMs: number,
): void {
  const sub = store.submissions.find((item) => item.id === submissionId);
  if (!sub) throw new Error("Not found.");
  const campaign = store.campaigns.find((item) => item.id === sub.campaignId);
  if (!campaign) throw new Error("Campaign missing.");
  if (campaign.brandId !== actor.id && !actor.roles.includes("admin")) {
    throw new Error("Not allowed.");
  }

  const at = new Date(nowMs).toISOString();

  if (input.status === "rejected") {
    if (sub.status === "rejected") return;
    // A flagged clip is no longer "approved", but it can still be holding a reserve.
    if (sub.reservedCents > 0 || sub.status === "approved") {
      clawbackSubmission(store, sub.id, nowMs, "Rejected. Earnings returned to the campaign.");
    }
    sub.status = "rejected";
    sub.reviewNote = input.reviewNote ?? sub.reviewNote;
    sub.updatedAt = at;
    return;
  }

  if (input.status === "approved") {
    if (sub.fraudState === "upheld" || sub.payoutState === "clawed_back") {
      throw new Error("This clip was forfeited.");
    }
    if (sub.status === "approved") return;
    sub.status = "approved";
    sub.reviewNote = input.reviewNote ?? null;
    markApprovedForPayout(sub, campaign, nowMs);
    sub.updatedAt = at;
    return;
  }

  if (sub.status === "flagged") return;
  sub.status = "flagged";
  sub.reviewNote = input.reviewNote ?? null;
  sub.updatedAt = at;
  store.fraudFlags.push({
    id: newId(),
    submissionId,
    reason: input.reviewNote || "Flagged by brand",
    status: "open",
    kind: "manual",
    score: null,
    appealNote: null,
    createdAt: at,
    resolvedAt: null,
  });
}

export async function reviewSubmissionForActor(
  actor: ReviewActor,
  submissionId: string,
  raw: unknown,
  nowMs = Date.now(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = submissionReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid review." };
  try {
    await updateStore((store) => {
      reviewSubmissionInStore(
        store,
        actor,
        submissionId,
        { status: parsed.data.status, reviewNote: parsed.data.reviewNote ?? null },
        nowMs,
      );
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not review the clip." };
  }
  return { ok: true };
}
