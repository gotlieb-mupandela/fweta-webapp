"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { OnboardingDraft, SocialAccount } from "@/lib/db/types";
import { pushAudit } from "@/lib/marketplace/audit";
import { pushNotification } from "@/lib/notifications/inbox";
import {
  accountsForUser,
  assertCanAddAccount,
  generateBioCode,
  reviewDecisionError,
  statsByAccount,
  withDefault,
} from "@/lib/onboarding/accounts";
import {
  cloneDraft,
  PLATFORM_LABEL,
  publicProfileUrl,
  socialsFromChecks,
  upsertSocialCheck,
  verdictFromProfileBody,
} from "@/lib/onboarding/model";
import { readPublicProfileHtml } from "@/lib/onboarding/profile-html";
import { addSocialAccountSchema, socialReviewSchema } from "@/lib/validations/accounts";

function revalidateAccounts() {
  revalidatePath("/onboarding");
  revalidatePath("/dashboard/settings/accounts");
  revalidatePath("/dashboard/clipper");
  revalidatePath("/dashboard/admin/accounts");
  revalidatePath("/dashboard/admin/onboarding");
}

function mirrorVerifiedCheck(
  draft: OnboardingDraft | undefined,
  userId: string,
  account: SocialAccount,
) {
  if (!draft) return;
  const existing = draft.checks.find((check) => check.platform === account.platform);
  if (existing?.status === "verified") return;
  draft.checks = upsertSocialCheck(draft.checks, userId, account.platform, account.handle);
  const row = draft.checks.find((check) => check.platform === account.platform);
  if (!row) return;
  if (account.status === "verified") {
    row.status = "verified";
    row.verifiedAt = account.verifiedAt;
  }
  draft.socials = socialsFromChecks(draft.checks);
  draft.updatedAt = account.updatedAt;
}

export async function listMySocialAccounts() {
  const session = await requireSession();
  const store = await readStore();
  const accounts = accountsForUser(store.socialAccounts, session.id);
  const stats = statsByAccount(
    accounts,
    store.submissions.filter((submission) => submission.clipperId === session.id),
  );
  return { accounts, stats };
}

export async function addSocialAccountAction(raw: unknown): Promise<
  | { ok: true; account: SocialAccount; draft: OnboardingDraft | null }
  | { ok: false; error: string }
> {
  const session = await requireSession();
  const parsed = addSocialAccountSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter a handle or profile link." };

  const now = nowIso();
  const accountId = newId();
  let saved: SocialAccount | null = null;
  let draft: OnboardingDraft | null = null;

  try {
    await updateStore((store) => {
      if (!store.socialAccounts) store.socialAccounts = [];
      const check = assertCanAddAccount(
        store.socialAccounts,
        session.id,
        parsed.data.platform,
        parsed.data.handle,
      );
      if ("error" in check) throw new Error(check.error);
      const profile = store.profiles.find((item) => item.id === session.id);
      if (!profile) throw new Error("Profile not found.");
      const samePlatform = store.socialAccounts.filter(
        (account) => account.userId === session.id && account.platform === parsed.data.platform,
      );
      const account: SocialAccount = {
        id: accountId,
        userId: session.id,
        platform: parsed.data.platform,
        handle: check.handle,
        code: generateBioCode(store.socialAccounts.map((item) => item.code)),
        status: "pending",
        isDefault: samePlatform.length === 0,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      store.socialAccounts.push(account);
      if (profile.onboarding?.version === 1) {
        mirrorVerifiedCheck(profile.onboarding, profile.id, account);
        profile.socials = { ...(profile.socials ?? {}), ...profile.onboarding.socials };
        draft = cloneDraft(profile.onboarding);
      }
      const url = publicProfileUrl(account.platform, account.handle);
      if (url) {
        profile.socials = { ...(profile.socials ?? {}), [account.platform]: url };
      }
      profile.updatedAt = now;
      saved = account;
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not add that account." };
  }

  revalidateAccounts();
  if (!saved) return { ok: false, error: "Could not add that account." };
  return { ok: true, account: saved, draft };
}

export async function requestSocialReviewAction(accountId: string): Promise<
  | { ok: true; account: SocialAccount; draft: OnboardingDraft | null }
  | { ok: false; error: string }
> {
  const session = await requireSession();
  const store = await readStore();
  const account = (store.socialAccounts ?? []).find(
    (item) => item.id === accountId && item.userId === session.id,
  );
  if (!account) return { ok: false, error: "Account not found." };
  if (account.status === "verified") return { ok: false, error: "This account is already verified." };
  if (account.status === "review") return { ok: false, error: "This account is already waiting for review." };
  const url = publicProfileUrl(account.platform, account.handle);
  if (!url) return { ok: false, error: "That handle does not look right." };

  const html = await readPublicProfileHtml(url);
  const verdict = verdictFromProfileBody(html, account.code);
  const bioHint = verdict === "verified" ? "match" : verdict;

  const requestedAt = nowIso();
  let saved: SocialAccount | null = null;
  let draft: OnboardingDraft | null = null;
  await updateStore((next) => {
    const row = (next.socialAccounts ?? []).find((item) => item.id === accountId && item.userId === session.id);
    const profile = next.profiles.find((item) => item.id === session.id);
    if (!row || !profile || row.handle !== account.handle) return;
    if (row.status === "verified" || row.status === "review") return;
    row.status = "review";
    row.reviewRequestedAt = requestedAt;
    row.rejectionReason = null;
    row.bioHint = bioHint;
    row.updatedAt = requestedAt;
    profile.updatedAt = requestedAt;
    saved = { ...row };
    if (profile.onboarding?.version === 1) draft = cloneDraft(profile.onboarding);
  });

  revalidateAccounts();
  if (!saved) return { ok: false, error: "Could not send this account for review." };
  return { ok: true, account: saved, draft };
}

export async function regenerateSocialCodeAction(accountId: string): Promise<
  | { ok: true; account: SocialAccount }
  | { ok: false; error: string }
> {
  const session = await requireSession();
  let saved: SocialAccount | null = null;
  try {
    await updateStore((store) => {
      const row = (store.socialAccounts ?? []).find((item) => item.id === accountId && item.userId === session.id);
      if (!row) throw new Error("Account not found.");
      const now = nowIso();
      const code = generateBioCode(
        (store.socialAccounts ?? []).map((item) => item.code).filter((item) => item !== row.code),
      );
      row.code = code;
      row.status = "pending";
      row.verifiedAt = null;
      row.reviewRequestedAt = null;
      row.rejectionReason = null;
      row.bioHint = null;
      row.updatedAt = now;
      const profile = store.profiles.find((item) => item.id === session.id);
      const check = profile?.onboarding?.checks.find(
        (item) => item.platform === row.platform && item.handle.toLowerCase() === row.handle.toLowerCase(),
      );
      if (check) {
        check.code = code;
        check.status = "pending";
        check.verifiedAt = null;
      }
      saved = { ...row };
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not create a new code." };
  }
  revalidateAccounts();
  if (!saved) return { ok: false, error: "Could not create a new code." };
  return { ok: true, account: saved };
}

export async function setDefaultSocialAccountAction(accountId: string) {
  const session = await requireSession();
  let found = false;
  await updateStore((store) => {
    if (!store.socialAccounts) return;
    const target = store.socialAccounts.find((item) => item.id === accountId && item.userId === session.id);
    if (!target) return;
    found = true;
    store.socialAccounts = withDefault(store.socialAccounts, session.id, accountId);
  });
  if (!found) return { ok: false as const, error: "Account not found." };
  revalidateAccounts();
  return { ok: true as const };
}

export async function removeSocialAccountAction(accountId: string) {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      const accounts = store.socialAccounts ?? [];
      const target = accounts.find((item) => item.id === accountId && item.userId === session.id);
      if (!target) throw new Error("Account not found.");
      const used = store.submissions.some((submission) => submission.socialAccountId === accountId);
      if (used) throw new Error("This account already has submissions, so it stays on your profile.");
      store.socialAccounts = accounts.filter((item) => item.id !== accountId);
      const siblings = store.socialAccounts.filter(
        (item) => item.userId === session.id && item.platform === target.platform,
      );
      if (target.isDefault && siblings[0]) siblings[0].isDefault = true;
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Could not remove that account." };
  }
  revalidateAccounts();
  return { ok: true as const };
}

export async function adminReviewSocialAccountAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const parsed = socialReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Choose a decision." };
  const reasonError = reviewDecisionError(parsed.data.decision, parsed.data.reason ?? "");
  if (reasonError) return { ok: false as const, error: reasonError };

  try {
    await updateStore((store) => {
      const row = (store.socialAccounts ?? []).find((item) => item.id === parsed.data.accountId);
      if (!row) throw new Error("Account not found.");
      if (row.status !== "review") throw new Error("This account is not waiting for review.");
      const profile = store.profiles.find((item) => item.id === row.userId);
      const now = nowIso();
      const approved = parsed.data.decision === "verified";
      row.status = approved ? "verified" : "rejected";
      row.verifiedAt = approved ? now : null;
      row.rejectionReason = approved ? null : (parsed.data.reason ?? "").trim();
      row.updatedAt = now;
      if (profile?.onboarding?.version === 1) {
        if (approved) mirrorVerifiedCheck(profile.onboarding, profile.id, row);
        else {
          const check = profile.onboarding.checks.find(
            (item) => item.platform === row.platform && item.handle.toLowerCase() === row.handle.toLowerCase(),
          );
          if (check) {
            check.status = "pending";
            check.verifiedAt = null;
          }
        }
      }
      if (profile) {
        pushNotification(store, {
          id: newId(),
          userId: profile.id,
          kind: "account_reviewed",
          title: approved ? "Account verified" : "Account was not verified",
          body: approved
            ? `Your ${PLATFORM_LABEL[row.platform]} @${row.handle} is verified. You can remove the code from your bio and use this account on clips.`
            : row.rejectionReason || "Add the code to the public bio and send it again.",
          href: "/dashboard/settings/accounts",
          readAt: null,
          createdAt: now,
        });
      }
      pushAudit(store, {
        actorId: session.id,
        action: "account.review",
        summary: `${approved ? "Approved" : "Rejected"} ${row.platform} @${row.handle}`,
        targetType: "social_account",
        targetId: row.id,
      });
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not review." };
  }
  revalidateAccounts();
  return { ok: true as const };
}

export async function adminVerifySocialAccountAction(accountId: string) {
  return adminReviewSocialAccountAction({ accountId, decision: "verified" });
}

export async function adminRemoveSocialAccountAction(accountId: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  let found = false;
  await updateStore((store) => {
    const before = store.socialAccounts ?? [];
    if (!before.some((item) => item.id === accountId)) return;
    found = true;
    store.socialAccounts = before.filter((item) => item.id !== accountId);
  });
  if (!found) return { ok: false as const, error: "Account not found." };
  revalidateAccounts();
  return { ok: true as const };
}
