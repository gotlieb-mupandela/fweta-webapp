"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { Submission } from "@/lib/db/types";
import { submissionReviewSchema, submissionSchema } from "@/lib/validations/submission";

function normalizePostUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return url.trim();
  }
}

function revalidateClipperSurfaces(campaignId?: string) {
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/dashboard/clipper/submissions");
  revalidatePath("/dashboard/clipper/earnings");
  revalidatePath("/campaigns");
  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/dashboard/brand/campaigns/${campaignId}/submissions`);
  }
}

export async function submitClipAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("clipper") && !session.roles.includes("influencer") && !session.roles.includes("admin")) {
    return { ok: false as const, error: "Creator role required." };
  }
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid submission." };

  const postUrl = normalizePostUrl(parsed.data.postUrl);
  if (!postUrl) return { ok: false as const, error: "Enter a valid post URL." };

  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === parsed.data.campaignId);
  if (!campaign || campaign.status !== "active") {
    return { ok: false as const, error: "Campaign is not accepting submissions." };
  }
  if (!campaign.platforms.includes(parsed.data.platform)) {
    return { ok: false as const, error: "Platform not allowed for this campaign." };
  }
  if (campaign.budgetSpentCents >= campaign.budgetTotalCents) {
    return { ok: false as const, error: "This campaign's budget is exhausted." };
  }
  const alreadySubmitted = store.submissions.some(
    (s) =>
      s.clipperId === session.id &&
      s.campaignId === campaign.id &&
      normalizePostUrl(s.postUrl) === postUrl,
  );
  if (alreadySubmitted) {
    return { ok: false as const, error: "You already submitted this link to this campaign." };
  }

  const now = nowIso();
  const submission: Submission = {
    id: newId(),
    campaignId: parsed.data.campaignId,
    clipperId: session.id,
    postUrl,
    platform: parsed.data.platform,
    status: "pending",
    reviewNote: null,
    views: 0,
    earningsCents: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await updateStore((s) => {
      const camp = s.campaigns.find((c) => c.id === parsed.data.campaignId);
      if (!camp || camp.status !== "active") {
        throw new Error("Campaign is not accepting submissions.");
      }
      const duplicate = s.submissions.some(
        (x) =>
          x.clipperId === session.id &&
          x.campaignId === camp.id &&
          normalizePostUrl(x.postUrl) === postUrl,
      );
      if (duplicate) {
        throw new Error("You already submitted this link to this campaign.");
      }
      s.submissions.push(submission);
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not submit clip." };
  }
  revalidateClipperSurfaces(campaign.id);
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
  revalidatePath("/dashboard/brand/submissions");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/fraud");
  revalidatePath("/dashboard/admin/stats");
  revalidateClipperSurfaces(campaign.id);
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

export async function listBrandPendingSubmissions() {
  const session = await requireSession();
  if (!session.roles.includes("brand") && !session.roles.includes("admin")) return [];
  const store = await readStore();
  const campaignIds = new Set(
    store.campaigns
      .filter((c) => (session.roles.includes("admin") ? true : c.brandId === session.id))
      .map((c) => c.id),
  );
  return store.submissions
    .filter((s) => campaignIds.has(s.campaignId) && s.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
