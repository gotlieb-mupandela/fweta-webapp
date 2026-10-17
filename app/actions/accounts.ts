"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { OnboardingDraft, SocialAccount } from "@/lib/db/types";
import {
  accountsForUser,
  assertCanAddAccount,
  bioCodeForAccount,
  statsByAccount,
  withDefault,
} from "@/lib/onboarding/accounts";
import {
  cloneDraft,
  publicProfileUrl,
  socialsFromChecks,
  upsertSocialCheck,
  verdictFromProfileBody,
} from "@/lib/onboarding/model";
import { readPublicProfileHtml } from "@/lib/onboarding/profile-html";
import { addSocialAccountSchema } from "@/lib/validations/accounts";

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
        code: bioCodeForAccount(session.id, accountId),
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

export async function verifySocialAccountAction(accountId: string): Promise<
  | { ok: true; account: SocialAccount; draft: OnboardingDraft | null }
  | { ok: false; error: string }
> {
  const session = await requireSession();
  const store = await readStore();
  const account = (store.socialAccounts ?? []).find(
    (item) => item.id === accountId && item.userId === session.id,
  );
  if (!account) return { ok: false, error: "Account not found." };
  const url = publicProfileUrl(account.platform, account.handle);
  if (!url) return { ok: false, error: "That handle does not look right." };

  const html = await readPublicProfileHtml(url);
  const verdict = verdictFromProfileBody(html, account.code);
  if (verdict === "unread") {
    return { ok: false, error: "We could not open that profile just now. Try again in a moment." };
  }
  if (verdict === "missing") {
    return {
      ok: false,
      error: "The code is not in the public bio yet. Add it, wait a few seconds, and check again.",
    };
  }

  const verifiedAt = nowIso();
  let saved: SocialAccount | null = null;
  let draft: OnboardingDraft | null = null;
  await updateStore((next) => {
    const row = (next.socialAccounts ?? []).find((item) => item.id === accountId && item.userId === session.id);
    const profile = next.profiles.find((item) => item.id === session.id);
    if (!row || !profile || row.handle !== account.handle) return;
    row.status = "verified";
    row.verifiedAt = verifiedAt;
    row.updatedAt = verifiedAt;
    if (profile.onboarding?.version === 1) {
      mirrorVerifiedCheck(profile.onboarding, profile.id, row);
      profile.socials = { ...(profile.socials ?? {}), ...profile.onboarding.socials };
      draft = cloneDraft(profile.onboarding);
    }
    profile.updatedAt = verifiedAt;
    saved = { ...row };
  });

  revalidateAccounts();
  if (!saved) return { ok: false, error: "Could not save verification." };
  return { ok: true, account: saved, draft };
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

export async function adminVerifySocialAccountAction(accountId: string) {
  const session = await requireSession();
  if (!session.roles.includes("admin")) return { ok: false as const, error: "Admin only." };
  const verifiedAt = nowIso();
  let found = false;
  await updateStore((store) => {
    const row = (store.socialAccounts ?? []).find((item) => item.id === accountId);
    if (!row) return;
    found = true;
    row.status = "verified";
    row.verifiedAt = verifiedAt;
    row.updatedAt = verifiedAt;
    const profile = store.profiles.find((item) => item.id === row.userId);
    if (profile?.onboarding?.version === 1) {
      mirrorVerifiedCheck(profile.onboarding, profile.id, row);
    }
  });
  if (!found) return { ok: false as const, error: "Account not found." };
  revalidateAccounts();
  return { ok: true as const };
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
