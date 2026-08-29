"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { Submission } from "@/lib/db/types";
import { submissionReviewSchema, submissionSchema } from "@/lib/validations/submission";

export async function submitClipAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("clipper") && !session.roles.includes("influencer")) {
    return { ok: false as const, error: "Creator role required." };
  }
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid submission." };

  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === parsed.data.campaignId);
  if (!campaign || campaign.status !== "active") {
    return { ok: false as const, error: "Campaign is not accepting submissions." };
  }
  if (!campaign.platforms.includes(parsed.data.platform)) {
    return { ok: false as const, error: "Platform not allowed for this campaign." };
  }

  const now = nowIso();
  const submission: Submission = {
    id: newId(),
    campaignId: parsed.data.campaignId,
    clipperId: session.id,
    postUrl: parsed.data.postUrl,
    platform: parsed.data.platform,
    status: "pending",
    reviewNote: null,
    views: 0,
    earningsCents: 0,
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => {
    s.submissions.push(submission);
  });
  revalidatePath("/dashboard/clipper/submissions");
  return { ok: true as const, id: submission.id };
}

export async function reviewSubmissionAction(id: string, raw: unknown) {
  const session = await requireSession();
  const parsed = submissionReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid review." };

  const store = await readStore();
  const submission = store.submissions.find((s) => s.id === id);
  if (!submission) return { ok: false as const, error: "Not found." };
  const campaign = store.campaigns.find((c) => c.id === submission.campaignId);
  if (!campaign) return { ok: false as const, error: "Campaign missing." };
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
    return { ok: false as const, error: "Not allowed." };
  }

  await updateStore((s) => {
    const sub = s.submissions.find((x) => x.id === id);
    if (!sub) return;
    sub.status = parsed.data.status;
    sub.reviewNote = parsed.data.reviewNote ?? null;
    sub.updatedAt = nowIso();
    if (parsed.data.status === "flagged") {
      s.fraudFlags.push({
        id: newId(),
        submissionId: id,
        reason: parsed.data.reviewNote || "Flagged by brand",
        status: "open",
        createdAt: nowIso(),
        resolvedAt: null,
      });
    }
  });

  revalidatePath(`/dashboard/brand/campaigns/${campaign.id}/submissions`);
  return { ok: true as const };
}

export async function listClipperSubmissions() {
  const session = await requireSession();
  const store = await readStore();
  return store.submissions
    .filter((s) => s.clipperId === session.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listCampaignSubmissions(campaignId: string) {
  const session = await requireSession();
  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === campaignId);
  if (!campaign) return [];
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) return [];
  return store.submissions
    .filter((s) => s.campaignId === campaignId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
