"use server";

import { revalidatePath } from "next/cache";

import { recalculateEarningsJob } from "@/app/actions/jobs";
import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import { recordViewsSchema } from "@/lib/validations/accounts";

export async function recordSubmissionViewsAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = recordViewsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter a whole number of views." };

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
      if (parsed.data.views === submission.views) return;
      const now = nowIso();
      store.viewSnapshots.push({
        id: newId(),
        submissionId: submission.id,
        views: parsed.data.views,
        recordedAt: now,
        source: "admin",
      });
      submission.views = parsed.data.views;
      submission.updatedAt = now;
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not record views." };
  }

  const earnings = await recalculateEarningsJob();
  revalidatePath("/dashboard/admin/views");
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/clipper/earnings");
  revalidatePath("/dashboard/brand");
  return { ok: true as const, creditedCents: earnings.creditedCents };
}
