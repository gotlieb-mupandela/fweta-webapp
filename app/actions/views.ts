"use server";

import { revalidatePath } from "next/cache";

import { recalculateEarningsJob } from "@/app/actions/jobs";
import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import { manualViewsSchema } from "@/lib/validations/views";

export async function setManualViewsAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = manualViewsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a whole view count." };

  try {
    await updateStore((store) => {
      const submission = store.submissions.find((row) => row.id === parsed.data.submissionId);
      if (!submission || submission.status !== "approved") {
        throw new Error("Approved submission not found.");
      }
      const campaign = store.campaigns.find((row) => row.id === submission.campaignId);
      if (!campaign) throw new Error("Campaign not found.");
      if (campaign.settledAt) {
        throw new Error("This campaign is already settled. Further views are not paid.");
      }
      if (parsed.data.views < submission.views) {
        throw new Error("View counts can be raised, not lowered. Earnings only move up.");
      }
      if (parsed.data.views === submission.views) return;
      const at = nowIso();
      submission.views = parsed.data.views;
      submission.updatedAt = at;
      store.viewSnapshots.push({
        id: newId(),
        submissionId: submission.id,
        views: parsed.data.views,
        recordedAt: at,
      });
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Failed." };
  }

  await recalculateEarningsJob();
  revalidatePath("/dashboard/admin/views");
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/brand");
  return { ok: true as const };
}
