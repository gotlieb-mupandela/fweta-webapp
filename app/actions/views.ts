"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import {
  confirmCreatorViewForActor,
  recordSubmissionViewsForActor,
  saveAdminViewForActor,
  saveBulkViewsForActor,
  setManualViewsForActor,
} from "@/lib/rewards/view-entry";
import { recordViewsSchema } from "@/lib/validations/accounts";
import { bulkViewsSchema, confirmViewSchema, manualViewsSchema, viewCountSchema } from "@/lib/validations/views";
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
  const saved = await saveAdminViewForActor(
    session,
    {
      submissionId: parsed.data.submissionId,
      views: parsed.data.views,
      likes: parsed.data.likes,
      comments: parsed.data.comments,
      note: parsed.data.note,
      screenshotPath,
    },
    nowMs,
  );
  if (!saved.ok) return saved;
  try {
    revalidateViewSurfaces(saved.campaignId ? [saved.campaignId] : []);
  } catch {
    // revalidatePath is a no-op outside a Next request.
  }
  return {
    ok: true as const,
    stopped: saved.stopped,
    message: saved.message,
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

  const saved = await saveBulkViewsForActor(session, parsed.data.entries, Date.now());
  if (!saved.ok) return saved;
  revalidateViewSurfaces(saved.campaignIds);
  const noun = parsed.data.entries.length === 1 ? "count" : "counts";
  return {
    ok: true as const,
    message:
      saved.stopped > 0
        ? `${parsed.data.entries.length} ${noun} saved. Earnings updated. ${saved.stopped === 1 ? "A campaign" : "Campaigns"} stopped because the budget ran out.`
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

  const saved = await confirmCreatorViewForActor(
    session,
    {
      snapshotId: parsed.data.snapshotId,
      submissionId: parsed.data.submissionId,
      views: parsed.data.views,
      likes: parsed.data.likes,
      comments: parsed.data.comments,
      note: parsed.data.note,
    },
    Date.now(),
  );
  if (!saved.ok) return saved;
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

  const saved = await recordSubmissionViewsForActor(
    session,
    { submissionId: parsed.data.submissionId, views: parsed.data.views },
    Date.now(),
  );
  if (!saved.ok) return saved;

  revalidateViewSurfaces(saved.campaignId ? [saved.campaignId] : []);
  return { ok: true as const, creditedCents: saved.creditedCents };
}

/** Admin total used by the simple view form. Earnings follow the saved count. */
export async function setManualViewsAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = manualViewsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a whole view count." };

  const saved = await setManualViewsForActor(
    session,
    { submissionId: parsed.data.submissionId, views: parsed.data.views },
    Date.now(),
  );
  if (!saved.ok) return saved;
  revalidateViewSurfaces(saved.campaignId ? [saved.campaignId] : []);
  return { ok: true as const };
}
