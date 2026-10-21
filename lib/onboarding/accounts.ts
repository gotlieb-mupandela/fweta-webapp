import { randomBytes } from "crypto";

import type { SocialAccount, Submission } from "@/lib/db/types";
import { bioCodeFor, sanitizeHandle } from "@/lib/onboarding/model";
import type { SocialPlatform } from "@/types/enums";

const BIO_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const MAX_ACCOUNTS_PER_PLATFORM = 8;

export type AccountStat = {
  accountId: string;
  submissions: number;
  views: number;
  earningsCents: number;
};

/** Stable per account so refreshing the page does not rotate the bio code. */
export function bioCodeForAccount(userId: string, accountId: string): string {
  return bioCodeFor(`${userId}:${accountId}`, "tiktok");
}

/** A new code that is not already in use. Regenerating calls this again. */
export function generateBioCode(taken: readonly string[] = []): string {
  const used = new Set(taken.map((code) => code.toUpperCase()));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const bytes = randomBytes(6);
    let body = "";
    for (let i = 0; i < 6; i += 1) {
      body += BIO_ALPHABET[bytes[i]! % BIO_ALPHABET.length]!;
    }
    const code = `FWETA-${body}`;
    if (!used.has(code)) return code;
  }
  return `FWETA-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function reviewDecisionError(decision: "verified" | "rejected", reason: string): string | null {
  if (decision === "rejected" && reason.trim().length < 3) {
    return "Add a short reason for the rejection.";
  }
  return null;
}

export function bioHintLabel(hint: SocialAccount["bioHint"]): string {
  if (hint === "match") return "A public page read included this code. Still confirm it yourself.";
  if (hint === "missing") {
    return "A public page read did not include this code. Open the profile before you approve.";
  }
  return "No public page read. Open the profile and confirm the code.";
}

export function accountsForUser(
  accounts: readonly SocialAccount[] | undefined,
  userId: string,
): SocialAccount[] {
  return (accounts ?? [])
    .filter((account) => account.userId === userId)
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.createdAt.localeCompare(b.createdAt));
}

export function assertCanAddAccount(
  accounts: readonly SocialAccount[],
  userId: string,
  platform: SocialPlatform,
  handle: string,
): { handle: string } | { error: string } {
  const cleaned = sanitizeHandle(handle);
  if (!cleaned) return { error: "Use a public handle with letters, numbers, dots, or underscores." };
  const mine = accounts.filter((account) => account.userId === userId && account.platform === platform);
  if (mine.some((account) => account.handle.toLowerCase() === cleaned.toLowerCase())) {
    return { error: "That account is already connected." };
  }
  if (mine.length >= MAX_ACCOUNTS_PER_PLATFORM) {
    return { error: `You can connect up to ${MAX_ACCOUNTS_PER_PLATFORM} accounts on this platform.` };
  }
  return { handle: cleaned };
}

export function withDefault(
  accounts: readonly SocialAccount[],
  userId: string,
  accountId: string,
): SocialAccount[] {
  const target = accounts.find((account) => account.id === accountId && account.userId === userId);
  if (!target) return accounts.map((account) => ({ ...account }));
  return accounts.map((account) => {
    if (account.userId !== userId || account.platform !== target.platform) return { ...account };
    return { ...account, isDefault: account.id === accountId };
  });
}

export function statsByAccount(
  accounts: readonly SocialAccount[],
  submissions: readonly Submission[],
): AccountStat[] {
  return accounts.map((account) => {
    const rows = submissions.filter((submission) => submission.socialAccountId === account.id);
    return {
      accountId: account.id,
      submissions: rows.length,
      views: rows.reduce((sum, row) => sum + row.views, 0),
      earningsCents: rows.reduce((sum, row) => sum + row.earningsCents, 0),
    };
  });
}

export function verifiedAccountsForPlatform(
  accounts: readonly SocialAccount[],
  userId: string,
  platform: SocialPlatform,
): SocialAccount[] {
  return accountsForUser(accounts, userId).filter(
    (account) => account.platform === platform && account.status === "verified",
  );
}
