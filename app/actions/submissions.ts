"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { hydrateSubmission } from "@/lib/rewards/content-rewards";
import { recordAppeal } from "@/lib/rewards/fraud";
import { reviewSubmissionForActor } from "@/lib/rewards/review-submission";
import { recordCheckedViewsForActor } from "@/lib/rewards/view-entry";
import { bioContainsCode, localBioConfirmAllowed, observeBio } from "@/lib/social/observe";
import { fraudAppealSchema, linkAccountSchema, submissionSchema, verifyAccountSchema } from "@/lib/validations/submission";

function makeBioCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FWETA-";
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

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
  const paths = [
    "/dashboard/clipper",
    "/dashboard/clipper/campaigns",
    "/dashboard/clipper/submissions",
    "/dashboard/clipper/earnings",
    "/campaigns",
  ];
  if (campaignId) {
    paths.push(`/campaigns/${campaignId}`);
    paths.push(`/dashboard/brand/campaigns/${campaignId}/submissions`);
  }
  try {
    for (const path of paths) revalidatePath(path);
  } catch {
    // revalidatePath is a no-op outside a Next request.
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
  const submission = hydrateSubmission({
    id: newId(),
    campaignId: parsed.data.campaignId,
    clipperId: session.id,
    postUrl,
    platform: parsed.data.platform,
    status: "pending",
    reviewNote: null,
    views: 0,
    baselineViews: null,
    payableViews: 0,
    reservedCents: 0,
    releasedCents: 0,
    earningsCents: 0,
    approvedAt: null,
    earningUntil: null,
    holdUntil: null,
    releasedAt: null,
    payoutState: "none",
    nextPollAt: null,
    lastPolledAt: null,
    postLive: null,
    likes: null,
    comments: null,
    fraudScore: 0,
    fraudState: "clear",
    fraudReasons: [],
    appealUsed: false,
    createdAt: now,
    updatedAt: now,
  });

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
  const result = await reviewSubmissionForActor(session, id, raw);
  if (!result.ok) return result;
  const store = await readStore();
  const submission = store.submissions.find((item) => item.id === id);
  if (submission) revalidateClipperSurfaces(submission.campaignId);
  return result;
}

export async function recordCheckedViewsAction(raw: unknown) {
  const session = await requireSession();
  const result = await recordCheckedViewsForActor(session, raw);
  if (!result.ok) return result;
  revalidateClipperSurfaces(result.campaignId);
  try {
    revalidatePath("/leaderboard");
  } catch {
    // revalidatePath is a no-op outside a Next request.
  }
  return { ok: true as const, creditedCents: result.creditedCents };
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

export async function appealClipAction(submissionId: string, raw: unknown) {
  const session = await requireSession();
  const parsed = fraudAppealSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Enter a short note." };
  const store = await readStore();
  const submission = store.submissions.find((s) => s.id === submissionId && s.clipperId === session.id);
  if (!submission) return { ok: false as const, error: "Not found." };
  try {
    await updateStore((s) => {
      const sub = s.submissions.find((item) => item.id === submissionId && item.clipperId === session.id);
      if (!sub) throw new Error("Not found.");
      recordAppeal(s, sub.id, parsed.data.note, nowIso());
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not send the appeal." };
  }
  revalidateClipperSurfaces(submission.campaignId);
  revalidatePath("/dashboard/admin/fraud");
  return { ok: true as const };
}

export async function listMyLinkedAccounts() {
  const session = await requireSession();
  const store = await readStore();
  return (store.linkedAccounts ?? [])
    .filter((account) => account.userId === session.id)
    .sort((a, b) => a.platform.localeCompare(b.platform));
}

export async function startLinkAccountAction(raw: unknown) {
  const session = await requireSession();
  const parsed = linkAccountSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Enter the handle you post with." };
  const handle = parsed.data.handle.trim().replace(/^@/, "");
  const now = nowIso();
  let id = "";
  await updateStore((s) => {
    if (!Array.isArray(s.linkedAccounts)) s.linkedAccounts = [];
    const existing = s.linkedAccounts.find(
      (account) => account.userId === session.id && account.platform === parsed.data.platform,
    );
    if (existing) {
      existing.handle = handle;
      existing.verifiedAt = null;
      existing.checkSource = null;
      existing.updatedAt = now;
      id = existing.id;
      return;
    }
    id = newId();
    s.linkedAccounts.push({
      id,
      userId: session.id,
      platform: parsed.data.platform,
      handle,
      bioCode: makeBioCode(),
      verifiedAt: null,
      checkSource: null,
      createdAt: now,
      updatedAt: now,
    });
  });
  revalidatePath("/dashboard/settings/accounts");
  return { ok: true as const, id };
}

export async function verifyLinkAccountAction(raw: unknown) {
  const session = await requireSession();
  const parsed = verifyAccountSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Choose an account to verify." };
  const store = await readStore();
  const account = (store.linkedAccounts ?? []).find((item) => item.id === parsed.data.id && item.userId === session.id);
  if (!account) return { ok: false as const, error: "Account not found." };

  const { bio, source } = await observeBio(account.platform, account.handle);
  let checkSource: string | null = source;
  if (bio != null) {
    if (!bioContainsCode(bio, account.bioCode)) {
      return { ok: false as const, error: "That public bio does not include your code yet." };
    }
  } else if (localBioConfirmAllowed()) {
    const pasted = parsed.data.pastedBio ?? "";
    if (!bioContainsCode(pasted, account.bioCode)) {
      return {
        ok: false as const,
        error: "Paste the public bio text that includes your code. This check is for local demo only.",
      };
    }
    checkSource = "local-paste";
  } else {
    return { ok: false as const, error: "We could not read a public bio for that account." };
  }

  await updateStore((s) => {
    const row = s.linkedAccounts.find((item) => item.id === account.id && item.userId === session.id);
    if (!row) return;
    row.verifiedAt = nowIso();
    row.checkSource = checkSource;
    row.updatedAt = row.verifiedAt;
  });
  revalidatePath("/dashboard/settings/accounts");
  return { ok: true as const };
}
