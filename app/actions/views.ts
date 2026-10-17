"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import type { DatabaseStore, Submission, ViewSnapshot } from "@/lib/db/types";
import { pushAudit } from "@/lib/marketplace/audit";
import { applyFraudScore } from "@/lib/rewards/fraud";
import { applyConfirmedViews } from "@/lib/rewards/earnings";
import { recordViewsSchema } from "@/lib/validations/accounts";
import { bulkViewsSchema, confirmViewSchema, manualViewsSchema, viewCountSchema, type ViewCountInput } from "@/lib/validations/views";
import { saveViewScreenshot } from "@/lib/views/screenshots";

function revalidateViewSurfaces(campaignIds: string[]) {
  revalidatePath("/dashboard/admin/views");
  revalidatePath("/dashboard/admin/fraud");
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/clipper/earnings");
  revalidatePath("/dashboard/clipper/submissions");
  revalidatePath("/dashboard/brand");
  revalidatePath("/campaigns");
  for (const id of campaignIds) {
    revalidatePath(`/campaigns/${id}`);
    revalidatePath(`/dashboard/brand/campaigns/${id}`);
    revalidatePath(`/dashboard/brand/campaigns/${id}/submissions`);
  }
}

function optionalCount(value: FormDataEntryValue | null): number | null | "bad" {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return "bad";
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed > 2_000_000_000) return "bad";
  return parsed;
}

function requiredCount(value: FormDataEntryValue | null): number | "bad" {
  const parsed = optionalCount(value);
  if (parsed == null || parsed === "bad") return "bad";
  return parsed;
}

function fileFrom(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === "string") return null;
  if (value.size <= 0) return null;
  return value;
}

type Saved = { campaignId: string; stopped: boolean };

function commitConfirmed(
  store: DatabaseStore,
  submission: Submission,
  input: ViewCountInput,
  source: ViewSnapshot["source"],
  checkedBy: string,
  screenshotPath: string | null,
  nowMs: number,
): Saved {
  const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
  if (!campaign) throw new Error("Campaign missing.");
  const at = new Date(nowMs).toISOString();
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
    screenshotPath,
    recordedAt: at,
    checkedBy,
    source,
    status: "confirmed",
  });
  applyConfirmedViews(store, submission.id, input.views, input.likes ?? null, input.comments ?? null, nowMs);
  const fresh = store.submissions.find((item) => item.id === submission.id);
  if (fresh) applyFraudScore(store, fresh, nowMs);
  const after = store.campaigns.find((item) => item.id === submission.campaignId);
  return { campaignId: submission.campaignId, stopped: after?.status === "completed" && campaign.status !== "completed" };
}

function assertApproved(submission: Submission | undefined): Submission {
  if (!submission) throw new Error("Clip not found.");
  if (submission.status !== "approved") throw new Error("Approve the clip before counting views.");
  if (submission.payoutState === "clawed_back") throw new Error("This clip was forfeited.");
  return submission;
}

export async function saveAdminViewAction(formData: FormData) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };

  const views = requiredCount(formData.get("views"));
  const likes = optionalCount(formData.get("likes"));
  const comments = optionalCount(formData.get("comments"));
  if (views === "bad" || likes === "bad" || comments === "bad") {
    return { ok: false as const, error: "View counts must be whole numbers." };
  }
  const parsed = viewCountSchema.safeParse({
    submissionId: formData.get("submissionId"),
    views,
    likes,
    comments,
    note: typeof formData.get("note") === "string" ? formData.get("note") : "",
  });
  if (!parsed.success) return { ok: false as const, error: "Enter a view count for this clip." };

  let screenshotPath: string | null = null;
  try {
    const file = fileFrom(formData.get("screenshot"));
    if (file) screenshotPath = await saveViewScreenshot(file);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not save the screenshot." };
  }

  const nowMs = Date.now();
  let saved: Saved = { campaignId: "", stopped: false };
  try {
    await updateStore((store) => {
      const submission = assertApproved(store.submissions.find((item) => item.id === parsed.data.submissionId));
      saved = commitConfirmed(store, submission, parsed.data, "admin", session.id, screenshotPath, nowMs);
      pushAudit(store, {
        actorId: session.id,
        action: "views.save",
        summary: `Saved ${parsed.data.views} views`,
        targetType: "submission",
        targetId: parsed.data.submissionId,
      });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not save the count." };
  }
  revalidateViewSurfaces(saved.campaignId ? [saved.campaignId] : []);
  return {
    ok: true as const,
    stopped: saved.stopped,
    message: saved.stopped
      ? "Count saved. Earnings updated, and the campaign stopped because the budget ran out."
      : "Count saved. Earnings, wallet, budget, and leaderboard are updated.",
  };
}

export async function saveBulkViewsAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = bulkViewsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter at least one whole-number view count." };

  const ids = new Set<string>();
  for (const entry of parsed.data.entries) {
    if (ids.has(entry.submissionId)) return { ok: false as const, error: "Each clip can only be saved once." };
    ids.add(entry.submissionId);
  }

  const nowMs = Date.now();
  const campaignIds = new Set<string>();
  let stopped = 0;
  try {
    await updateStore((store) => {
      const ready = parsed.data.entries.map((entry) => ({
        entry,
        submission: assertApproved(store.submissions.find((item) => item.id === entry.submissionId)),
      }));
      for (const item of ready) {
        const result = commitConfirmed(store, item.submission, item.entry, "bulk", session.id, null, nowMs);
        campaignIds.add(result.campaignId);
        if (result.stopped) stopped += 1;
      }
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not save the counts." };
  }
  revalidateViewSurfaces([...campaignIds]);
  const noun = parsed.data.entries.length === 1 ? "count" : "counts";
  return {
    ok: true as const,
    message:
      stopped > 0
        ? `${parsed.data.entries.length} ${noun} saved. Earnings updated. ${stopped === 1 ? "A campaign" : "Campaigns"} stopped because the budget ran out.`
        : `${parsed.data.entries.length} ${noun} saved. Earnings, wallets, budgets, and leaderboards are updated.`,
  };
}

export async function reportCreatorViewsAction(formData: FormData) {
  const session = await requireSession();
  const views = requiredCount(formData.get("views"));
  const likes = optionalCount(formData.get("likes"));
  const comments = optionalCount(formData.get("comments"));
  if (views === "bad" || likes === "bad" || comments === "bad") {
    return { ok: false as const, error: "View counts must be whole numbers." };
  }
  const parsed = viewCountSchema.safeParse({
    submissionId: formData.get("submissionId"),
    views,
    likes,
    comments,
    note: typeof formData.get("note") === "string" ? formData.get("note") : "",
  });
  if (!parsed.success) return { ok: false as const, error: "Enter the view count from your analytics." };

  let screenshotPath: string | null = null;
  try {
    const file = fileFrom(formData.get("screenshot"));
    if (file) screenshotPath = await saveViewScreenshot(file);
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not save the screenshot." };
  }

  const now = nowIso();
  let campaignId = "";
  try {
    await updateStore((store) => {
      const submission = store.submissions.find((item) => item.id === parsed.data.submissionId);
      if (!submission || submission.clipperId !== session.id) throw new Error("Clip not found.");
      if (submission.status === "rejected") throw new Error("This clip was rejected.");
      campaignId = submission.campaignId;
      for (const snap of store.viewSnapshots) {
        if (snap.submissionId === submission.id && snap.status === "pending") snap.status = "replaced";
      }
      store.viewSnapshots.push({
        id: newId(),
        submissionId: submission.id,
        views: parsed.data.views,
        likes: parsed.data.likes ?? null,
        comments: parsed.data.comments ?? null,
        note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
        screenshotPath,
        recordedAt: now,
        checkedBy: null,
        source: "creator",
        status: "pending",
      });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not send the report." };
  }
  revalidateViewSurfaces(campaignId ? [campaignId] : []);
  return {
    ok: true as const,
    message: "Report sent. It does not change earnings until an admin confirms the count.",
  };
}

export async function confirmCreatorViewAction(formData: FormData) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const views = requiredCount(formData.get("views"));
  const likes = optionalCount(formData.get("likes"));
  const comments = optionalCount(formData.get("comments"));
  if (views === "bad" || likes === "bad" || comments === "bad") {
    return { ok: false as const, error: "View counts must be whole numbers." };
  }
  const parsed = confirmViewSchema.safeParse({
    snapshotId: formData.get("snapshotId"),
    submissionId: formData.get("submissionId"),
    views,
    likes,
    comments,
    note: typeof formData.get("note") === "string" ? formData.get("note") : "",
  });
  if (!parsed.success) return { ok: false as const, error: "Enter the confirmed view count." };

  const nowMs = Date.now();
  let saved: Saved = { campaignId: "", stopped: false };
  try {
    await updateStore((store) => {
      const snap = store.viewSnapshots.find((item) => item.id === parsed.data.snapshotId);
      if (!snap || snap.status !== "pending" || snap.submissionId !== parsed.data.submissionId) {
        throw new Error("That report is no longer waiting.");
      }
      const submission = store.submissions.find((item) => item.id === snap.submissionId);
      if (!submission) throw new Error("Clip not found.");
      if (submission.status === "rejected" || submission.payoutState === "clawed_back") {
        throw new Error("This clip can no longer be paid.");
      }
      const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
      if (!campaign) throw new Error("Campaign missing.");
      for (const other of store.viewSnapshots) {
        if (other.submissionId === submission.id && other.status === "pending" && other.id !== snap.id) {
          other.status = "replaced";
        }
      }
      snap.views = parsed.data.views;
      snap.likes = parsed.data.likes ?? null;
      snap.comments = parsed.data.comments ?? null;
      snap.note = parsed.data.note?.trim() ? parsed.data.note.trim() : snap.note;
      snap.status = "confirmed";
      snap.checkedBy = session.id;
      snap.recordedAt = new Date(nowMs).toISOString();
      applyConfirmedViews(
        store,
        submission.id,
        parsed.data.views,
        parsed.data.likes ?? null,
        parsed.data.comments ?? null,
        nowMs,
      );
      const fresh = store.submissions.find((item) => item.id === submission.id);
      if (fresh) applyFraudScore(store, fresh, nowMs);
      const after = store.campaigns.find((item) => item.id === submission.campaignId);
      saved = {
        campaignId: submission.campaignId,
        stopped: after?.status === "completed" && campaign.status !== "completed",
      };
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not confirm the count." };
  }
  revalidateViewSurfaces(saved.campaignId ? [saved.campaignId] : []);
  return {
    ok: true as const,
    message: saved.stopped
      ? "Count confirmed. Earnings updated, and the campaign stopped because the budget ran out."
      : "Count confirmed. Earnings, wallet, budget, and leaderboard are updated.",
  };
}

/** Simple admin view entry used by the onboarding view form. */
export async function recordSubmissionViewsAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = recordViewsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a whole number of views." };

  let campaignId = "";
  try {
    await updateStore((store) => {
      const submission = store.submissions.find((item) => item.id === parsed.data.submissionId);
      if (!submission) throw new Error("Submission not found.");
      if (submission.status !== "approved") {
        throw new Error("Approve the clip before recording views.");
      }
      if (parsed.data.views < submission.views) {
        throw new Error("Views cannot go backwards.");
      }
      campaignId = submission.campaignId;
      const nowMs = Date.now();
      const at = new Date(nowMs).toISOString();
      for (const snap of store.viewSnapshots) {
        if (snap.submissionId === submission.id && snap.status === "pending") snap.status = "replaced";
      }
      store.viewSnapshots.push({
        id: newId(),
        submissionId: submission.id,
        views: parsed.data.views,
        likes: submission.likes,
        comments: submission.comments,
        note: null,
        screenshotPath: null,
        recordedAt: at,
        checkedBy: session.id,
        source: "admin",
        status: "confirmed",
      });
      applyConfirmedViews(
        store,
        submission.id,
        parsed.data.views,
        submission.likes,
        submission.comments,
        nowMs,
      );
      const fresh = store.submissions.find((item) => item.id === submission.id);
      if (fresh) applyFraudScore(store, fresh, nowMs);
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not record views." };
  }

  revalidateViewSurfaces(campaignId ? [campaignId] : []);
  return { ok: true as const, creditedCents: 0 };
}

/** Admin total used by the simple view form. Earnings follow the saved count. */
export async function setManualViewsAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = manualViewsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a whole view count." };

  const nowMs = Date.now();
  let campaignId = "";
  try {
    await updateStore((store) => {
      const submission = assertApproved(store.submissions.find((item) => item.id === parsed.data.submissionId));
      const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
      if (campaign?.settledAt || campaign?.closedAt) {
        throw new Error("This campaign is already settled. Further views are not paid.");
      }
      if (parsed.data.views < submission.views) {
        throw new Error("Views cannot go backwards.");
      }
      campaignId = submission.campaignId;
      if (parsed.data.views === submission.views) return;
      commitConfirmed(store, submission, parsed.data, "admin", session.id, null, nowMs);
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not save the count." };
  }
  revalidateViewSurfaces(campaignId ? [campaignId] : []);
  return { ok: true as const };
}
