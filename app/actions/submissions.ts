"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { notifySubmissionReviewed } from "@/lib/notifications/events";
import type { Submission } from "@/lib/db/types";
import { canEditCampaign, canViewCampaign } from "@/lib/onboarding/access";
import { verifiedAccountsForPlatform } from "@/lib/onboarding/accounts";
import { checksSatisfied } from "@/lib/marketplace/growth";
import { REFERRAL_BONUS_CENTS } from "@/lib/marketplace/growth";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import {
  DAILY_SUBMIT_CAP,
  PLATFORM_LABEL,
  campaignIsDiscoverable,
  detectPlatform,
  meetsPayoutMinimum,
  meetsViewFloor,
  normalizeHandle,
  projectedPayoutCents,
} from "@/lib/rewards/content-rewards";
import { clawbackSubmission, markApprovedForPayout, settleSubmission } from "@/lib/rewards/earnings";
import { recordAppeal } from "@/lib/rewards/fraud";
import { formatMoney } from "@/lib/utils";
import {
  fraudAppealSchema,
  linkAccountSchema,
  submissionReviewSchema,
  submissionSchema,
  verifyAccountSchema,
} from "@/lib/validations/submission";
import {
  bioContainsCode,
  localBioConfirmAllowed,
  observeBio,
  observePost,
  realViewProvidersConfigured,
} from "@/lib/social/observe";

const BIO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeBioCode(): string {
  const bytes = randomBytes(6);
  let code = "FWETA-";
  for (let i = 0; i < 6; i += 1) code += BIO_ALPHABET[bytes[i]! % BIO_ALPHABET.length];
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
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/dashboard/clipper/submissions");
  revalidatePath("/dashboard/clipper/earnings");
  revalidatePath("/dashboard/settings/accounts");
  revalidatePath("/campaigns");
  if (campaignId) {
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/dashboard/brand/campaigns/${campaignId}`);
    revalidatePath(`/dashboard/brand/campaigns/${campaignId}/submissions`);
  }
}

function handlesMatch(linked: string, author: string | null): boolean {
  if (!author) return true;
  const left = normalizeHandle(linked);
  const right = normalizeHandle(author);
  if (!left || !right) return true;
  return left === right;
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

  const detected = detectPlatform(postUrl);
  if (!detected) {
    return { ok: false as const, error: "Paste a public TikTok, Instagram, YouTube, or X link." };
  }

  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === parsed.data.campaignId);
  if (!campaign || !campaignIsDiscoverable(campaign)) {
    return { ok: false as const, error: "Campaign is not accepting submissions." };
  }
  if (!campaign.platforms.includes(detected)) {
    return { ok: false as const, error: "That platform is not paid by this campaign." };
  }
  if (campaign.budgetSpentCents >= campaign.budgetTotalCents) {
    return { ok: false as const, error: "This campaign's budget is exhausted." };
  }
  if (!checksSatisfied(campaign.requiredChecks, parsed.data.confirmedChecks)) {
    return { ok: false as const, error: "Confirm every required tag before you submit." };
  }
  const linked = store.linkedAccounts.find(
    (account) => account.userId === session.id && account.platform === detected && account.verifiedAt,
  );
  const accountId = parsed.data.socialAccountId;
  const verifiedSocial = verifiedAccountsForPlatform(store.socialAccounts ?? [], session.id, detected);
  let chosenSocial = verifiedSocial.find((item) => item.id === accountId);
  if (accountId) {
    const account = (store.socialAccounts ?? []).find(
      (item) => item.id === accountId && item.userId === session.id,
    );
    if (!account || account.status !== "verified" || account.platform !== detected) {
      return { ok: false as const, error: "Choose a verified account on that platform." };
    }
    chosenSocial = account;
  } else if (verifiedSocial.length > 0) {
    return { ok: false as const, error: "Choose which connected account this clip came from." };
  }
  if (!linked && !chosenSocial) {
    return {
      ok: false as const,
      error: `Verify a ${PLATFORM_LABEL[detected]} account with your Fweta bio code before submitting.`,
    };
  }

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = store.submissions.filter(
    (item) =>
      item.clipperId === session.id &&
      item.campaignId === campaign.id &&
      item.platform === detected &&
      Date.parse(item.createdAt) >= dayAgo,
  );
  if (recent.length >= DAILY_SUBMIT_CAP) {
    return { ok: false as const, error: "This account already submitted 5 posts to this campaign in the last 24 hours." };
  }

  if (realViewProvidersConfigured()) {
    try {
      const observation = await observePost(detected, postUrl);
      const expectedHandle = linked?.handle ?? chosenSocial?.handle ?? "";
      if (observation && expectedHandle && !handlesMatch(expectedHandle, observation.authorHandle)) {
        return { ok: false as const, error: "This post is not from the account you verified." };
      }
      if (observation?.live === false) {
        return { ok: false as const, error: "That post is not public." };
      }
    } catch {
      return { ok: false as const, error: "The view provider could not read that post. Try again later." };
    }
  }

  const now = nowIso();
  const baseline = parsed.data.viewsAtSubmit ?? 0;
  const submission: Submission = {
    id: newId(),
    campaignId: parsed.data.campaignId,
    clipperId: session.id,
    postUrl,
    platform: detected,
    status: "pending",
    reviewNote: null,
    views: baseline,
    baselineViews: baseline,
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
    socialAccountId: accountId ?? null,
    confirmedChecks: parsed.data.confirmedChecks ?? [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await updateStore((s) => {
      const camp = s.campaigns.find((c) => c.id === parsed.data.campaignId);
      if (!camp || !campaignIsDiscoverable(camp)) throw new Error("Campaign is not accepting submissions.");
      if (!camp.platforms.includes(detected)) throw new Error("That platform is not paid by this campaign.");
      const verifiedLinked = s.linkedAccounts.some(
        (account) => account.userId === session.id && account.platform === detected && account.verifiedAt,
      );
      const verifiedSocialNow = verifiedAccountsForPlatform(s.socialAccounts ?? [], session.id, detected);
      if (accountId && !verifiedSocialNow.some((account) => account.id === accountId)) {
        throw new Error("Choose a verified account on that platform.");
      }
      if (!accountId && verifiedSocialNow.length > 0) {
        throw new Error("Choose which connected account this clip came from.");
      }
      if (!verifiedLinked && !accountId) {
        throw new Error(`Verify a ${PLATFORM_LABEL[detected]} account before submitting.`);
      }
      const duplicate = s.submissions.some(
        (item) => item.campaignId === camp.id && normalizePostUrl(item.postUrl) === postUrl,
      );
      if (duplicate) throw new Error("This link is already on the campaign.");
      const burst = s.submissions.filter(
        (item) =>
          item.clipperId === session.id &&
          item.campaignId === camp.id &&
          item.platform === detected &&
          Date.parse(item.createdAt) >= dayAgo,
      );
      if (burst.length >= DAILY_SUBMIT_CAP) {
        throw new Error("This account already submitted 5 posts to this campaign in the last 24 hours.");
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
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid review." };
  }

  const store = await readStore();
  const submission = store.submissions.find((s) => s.id === id);
  if (!submission) return { ok: false as const, error: "Not found." };
  const campaign = store.campaigns.find((c) => c.id === submission.campaignId);
  if (!campaign) return { ok: false as const, error: "Campaign missing." };
  if (!canEditCampaign(store, session, campaign)) {
    return { ok: false as const, error: "Not allowed." };
  }
  const cancelApproved = submission.status === "approved" && parsed.data.status === "rejected";
  if (cancelApproved && submission.releasedCents > 0) {
    return {
      ok: false as const,
      error: "This clip is already in the wallet. The settled amount stays. Only an unsettled share can be returned.",
    };
  }
  if (!cancelApproved && submission.status !== "pending" && submission.status !== "flagged") {
    return { ok: false as const, error: "This clip has already been reviewed." };
  }

  const previousStatus = submission.status;
  const siblings = store.submissions.filter((item) => item.campaignId === campaign.id);
  if (parsed.data.status === "approved" && !meetsViewFloor(submission, campaign)) {
    return {
      ok: false as const,
      error: `This clip has ${submission.payableViews} qualified views. Review opens at ${campaign.minViews}.`,
    };
  }
  if (parsed.data.status === "approved" && !meetsPayoutMinimum(submission, campaign, siblings)) {
    return {
      ok: false as const,
      error: `This clip is at ${formatMoney(projectedPayoutCents(submission, campaign, siblings))}. Review opens at ${formatMoney(campaign.minPayoutCents)}.`,
    };
  }

  try {
    await updateStore((s) => {
      const sub = s.submissions.find((x) => x.id === id);
      const camp = s.campaigns.find((c) => c.id === submission.campaignId);
      if (!sub || !camp) return;
      const cancelApproved = sub.status === "approved" && parsed.data.status === "rejected";
      if (cancelApproved && sub.releasedCents > 0) {
        throw new Error("This clip is already in the wallet. The settled amount stays.");
      }
      if (!cancelApproved && sub.status !== "pending" && sub.status !== "flagged") {
        throw new Error("This clip has already been reviewed.");
      }
      if (cancelApproved) {
        clawbackSubmission(s, sub.id, Date.now(), parsed.data.reviewNote?.trim() || "Clip rejected. Unsettled share returned.");
        sub.status = "rejected";
        sub.reviewNote = parsed.data.reviewNote?.trim() || sub.reviewNote;
        sub.updatedAt = nowIso();
        return;
      }
      const all = s.submissions.filter((item) => item.campaignId === camp.id);
      if (parsed.data.status === "approved" && !meetsViewFloor(sub, camp)) {
        throw new Error("This clip has not reached the view floor yet.");
      }
      if (parsed.data.status === "approved" && !meetsPayoutMinimum(sub, camp, all)) {
        throw new Error("This clip has not reached the minimum payout yet.");
      }
      sub.status = parsed.data.status;
      sub.reviewNote = parsed.data.reviewNote?.trim() || null;
      sub.updatedAt = nowIso();
      if (parsed.data.status === "approved") {
        const nowMs = Date.now();
        markApprovedForPayout(sub, camp, nowMs);
        settleSubmission(s, sub.id, nowMs, sub.postLive, sub.postLive != null);
        const clipper = s.profiles.find((item) => item.id === sub.clipperId);
        if (clipper?.referredByUserId && !clipper.referralRewarded) {
          const referrer = s.profiles.find((item) => item.id === clipper.referredByUserId);
          if (referrer && !referrer.suspended) {
            applyWalletDelta(s, {
              userId: referrer.id,
              availableDelta: REFERRAL_BONUS_CENTS,
              type: "credit",
              reason: "Referral bonus",
              referenceType: "referral_bonus",
              referenceId: clipper.id,
            });
            clipper.referralRewarded = true;
            s.notifications.push({
              id: newId(),
              userId: referrer.id,
              kind: "referral_bonus",
              title: "Referral bonus",
              body: `${clipper.displayName} had a clip approved. N$50 is in your available balance.`,
              href: "/dashboard/settings/wallet",
              readAt: null,
              createdAt: nowIso(),
            });
          }
        }
      }
      if (parsed.data.status === "flagged") {
        s.fraudFlags.push({
          id: newId(),
          submissionId: id,
          reason: parsed.data.reviewNote?.trim() || "Flagged by brand",
          status: "open",
          kind: "manual",
          score: null,
          appealNote: null,
          category: parsed.data.fraudCategory ?? "other",
          createdAt: nowIso(),
          resolvedAt: null,
        });
      }
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not review." };
  }

  revalidatePath(`/dashboard/brand/campaigns/${campaign.id}/submissions`);
  revalidateClipperSurfaces(campaign.id);
  if (
    previousStatus !== parsed.data.status &&
    (parsed.data.status === "approved" || parsed.data.status === "rejected")
  ) {
    await notifySubmissionReviewed(id);
  }
  return { ok: true as const };
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
  if (!canViewCampaign(store, session, campaign)) return [];
  return store.submissions
    .filter((s) => s.campaignId === campaignId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listMyLinkedAccounts() {
  const session = await requireSession();
  const store = await readStore();
  return store.linkedAccounts
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
  const account = store.linkedAccounts.find((item) => item.id === parsed.data.id && item.userId === session.id);
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
