import { newId } from "@/lib/db/store";
import type { DatabaseStore, Submission } from "@/lib/db/types";

import { FRAUD_REVIEW_SCORE } from "./content-rewards";

const SPIKE_MULTIPLIER = 8;
const SPIKE_DELTA = 5000;
const SPIKE_ABSOLUTE = 100_000;
const ENGAGEMENT_VIEWS = 2000;
const ENGAGEMENT_RATIO = 0.001;
const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

const SPIKE_REASON = "Views jumped much faster than the previous check.";
const ENGAGEMENT_REASON = "Likes and comments are very low for this many views.";
const NEW_ACCOUNT_REASON = "This Fweta account is less than 7 days old.";

export function fraudSignals(params: {
  views: number;
  likes: number | null;
  comments: number | null;
  snapshots: { views: number; recordedAt: string }[];
  profileCreatedAt: string | null;
  nowMs: number;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const snaps = [...params.snapshots].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  if (snaps.length >= 2) {
    const prev = snaps[snaps.length - 2].views;
    const last = snaps[snaps.length - 1].views;
    const delta = last - prev;
    if ((prev > 0 && last > prev * SPIKE_MULTIPLIER && delta > SPIKE_DELTA) || delta > SPIKE_ABSOLUTE) {
      score += 40;
      reasons.push(SPIKE_REASON);
    }
  }
  if (params.views >= ENGAGEMENT_VIEWS && params.likes != null && params.comments != null) {
    const ratio = (params.likes + params.comments) / params.views;
    if (ratio < ENGAGEMENT_RATIO) {
      score += 30;
      reasons.push(ENGAGEMENT_REASON);
    }
  }
  if (params.profileCreatedAt) {
    const created = Date.parse(params.profileCreatedAt);
    if (!Number.isNaN(created) && params.nowMs - created < NEW_ACCOUNT_MS && params.nowMs >= created) {
      score += 20;
      reasons.push(NEW_ACCOUNT_REASON);
    }
  }
  return { score, reasons };
}

export function applyFraudScore(store: DatabaseStore, sub: Submission, nowMs: number) {
  if (sub.status === "rejected" || sub.payoutState === "clawed_back") return;
  const profile = store.profiles.find((p) => p.id === sub.clipperId);
  const snapshots = store.viewSnapshots.filter(
    (v) => v.submissionId === sub.id && v.status === "confirmed",
  );
  const { score, reasons } = fraudSignals({
    views: sub.views,
    likes: sub.likes,
    comments: sub.comments,
    snapshots,
    profileCreatedAt: profile?.createdAt ?? null,
    nowMs,
  });
  sub.fraudScore = score;
  sub.fraudReasons = reasons;
  if (score < FRAUD_REVIEW_SCORE) return;
  if (sub.fraudState !== "clear") return;
  sub.fraudState = "review";
  const open = store.fraudFlags.some(
    (flag) => flag.submissionId === sub.id && flag.kind === "score" && flag.status === "open",
  );
  if (!open) {
    store.fraudFlags.push({
      id: newId(),
      submissionId: sub.id,
      reason: reasons.join(" ") || "This clip needs a manual look.",
      status: "open",
      kind: "score",
      score,
      appealNote: null,
      createdAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }
}

export function recordAppeal(store: DatabaseStore, submissionId: string, note: string, nowIso: string) {
  const sub = store.submissions.find((s) => s.id === submissionId);
  if (!sub || sub.fraudState !== "review" || sub.appealUsed) {
    throw new Error("No appeal is available on this clip.");
  }
  sub.fraudState = "appealed";
  sub.appealUsed = true;
  sub.updatedAt = nowIso;
  const flag = store.fraudFlags.find(
    (item) => item.submissionId === sub.id && item.kind === "score" && item.status === "open",
  );
  if (flag) flag.appealNote = note;
}
