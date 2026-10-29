import type { InfluencerProfile, Profile, ProfileSocials } from "@/lib/db/types";

const TEST_LOCAL =
  /(?:^|[.+_-])(?:test|qa|demo)(?:[.+_-]|$)|fwetalive|fweta[_-]?live/i;

export function isTestOrDemoAccount(input: {
  email?: string | null;
  displayName?: string | null;
}): boolean {
  const email = input.email?.trim().toLowerCase() ?? "";
  const name = input.displayName?.trim() ?? "";
  if (
    email.endsWith("@fweta.test") ||
    email.endsWith("@example.com") ||
    email.endsWith("@example.test")
  ) {
    return true;
  }
  const local = email.split("@")[0] ?? "";
  if (local && TEST_LOCAL.test(local)) return true;
  if (/^(test|qa|demo)\b/i.test(name)) return true;
  if (/\b(test|qa|demo)\s+(creator|account|user|clipper|influencer|brand)\b/i.test(name)) return true;
  if (/\b(test account|demo account|qa test)\b/i.test(name)) return true;
  if (/^fweta admin$/i.test(name)) return true;
  return false;
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
}

function handleLabel(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : trimmed.includes(".") ? `https://${trimmed}` : "";
  if (withScheme) {
    try {
      const part = new URL(withScheme).pathname.split("/").filter(Boolean).pop() ?? "";
      const bare = part.replace(/^@/, "").trim();
      if (bare.length >= 2 && !bare.includes(" ")) return `@${bare}`;
    } catch {
      // Fall through to a plain handle.
    }
  }
  const bare = trimmed.replace(/^@/, "").trim();
  if (bare.length >= 2 && !/\s/.test(bare) && !bare.includes("/")) return `@${bare}`;
  return null;
}

function firstHandle(socials: ProfileSocials | undefined): string | null {
  if (!socials) return null;
  for (const key of ["tiktok", "instagram", "youtube", "facebook", "x"] as const) {
    const handle = socials[key] ? handleLabel(socials[key]!) : null;
    if (handle) return handle;
  }
  return null;
}

/**
 * Public pages show a handle or first name when the stored name is the legal
 * first and last name copied from the account. A name the creator typed that
 * is not that legal pair is left as published.
 */
export function publicCreatorName(
  profile: { displayName: string; socials?: ProfileSocials },
  account?: { firstName?: string; lastName?: string; displayName?: string } | null,
): string {
  const shown = profile.displayName.trim() || "Creator";
  const first = account?.firstName?.trim() ?? "";
  const last = account?.lastName?.trim() ?? "";
  const legal = `${first} ${last}`.trim();
  if (!legal || !last) return shown;
  const accountName = account?.displayName?.trim() ?? "";
  const copied =
    namesEqual(shown, legal) || (accountName.length > 0 && namesEqual(shown, accountName) && namesEqual(accountName, legal));
  if (!copied) return shown;
  return firstHandle(profile.socials) ?? (first || "Creator");
}

function richness(profile: InfluencerProfile): number {
  const socials = Object.values(profile.socials ?? {}).filter((value) => value && String(value).trim()).length;
  return socials * 10 + (profile.bio?.trim().length ?? 0) / 100;
}

/** One row per user, then one row per identical display name. */
export function dedupeCreators<T extends InfluencerProfile>(rows: readonly T[]): T[] {
  const byUser = new Map<string, T>();
  for (const row of rows) {
    const prev = byUser.get(row.userId);
    if (
      !prev ||
      richness(row) > richness(prev) ||
      (richness(row) === richness(prev) && row.updatedAt > prev.updatedAt)
    ) {
      byUser.set(row.userId, row);
    }
  }
  const byName = new Map<string, T>();
  for (const row of byUser.values()) {
    const key = row.displayName.trim().toLowerCase().replace(/\s+/g, " ");
    const prev = byName.get(key);
    if (
      !prev ||
      richness(row) > richness(prev) ||
      (richness(row) === richness(prev) && row.updatedAt > prev.updatedAt)
    ) {
      byName.set(key, row);
    }
  }
  return [...byName.values()];
}

export function publicCreatorChoices(
  profiles: readonly InfluencerProfile[],
  accounts: readonly Profile[],
): InfluencerProfile[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const eligible = profiles.filter((profile) => profile.published).filter((profile) => {
    const account = accountsById.get(profile.userId);
    if (account?.suspended) return false;
    if (account?.roles.includes("admin")) return false;
    if (
      isTestOrDemoAccount({
        email: account?.email,
        displayName: `${profile.displayName} ${account?.displayName ?? ""}`,
      })
    ) {
      return false;
    }
    return true;
  });
  return dedupeCreators(eligible)
    .map((profile) => ({
      ...profile,
      displayName: publicCreatorName(profile, accountsById.get(profile.userId)),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Private offers go to influencer accounts only. Clippers, admins, and demo accounts stay off the list. */
export function privateOfferChoices(
  profiles: readonly InfluencerProfile[],
  accounts: readonly Profile[],
): InfluencerProfile[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const eligible = profiles.filter((profile) => {
    const account = accountsById.get(profile.userId);
    if (!account || account.suspended) return false;
    if (account.roles.includes("admin")) return false;
    if (!account.roles.includes("influencer")) return false;
    if (
      isTestOrDemoAccount({
        email: account.email,
        displayName: `${profile.displayName} ${account.displayName}`,
      })
    ) {
      return false;
    }
    return true;
  });
  return dedupeCreators(eligible).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** What a brand sees when picking a creator for a private offer. No account id. */
export type DealCreator = Omit<InfluencerProfile, "userId">;

function withoutUserId(profile: InfluencerProfile): DealCreator {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { userId, ...rest } = profile;
  return rest;
}

/** Private offer search: same eligibility as the page list, never the caller, no user ids. */
export function searchDealCreators(
  profiles: readonly InfluencerProfile[],
  accounts: readonly Profile[],
  viewerId: string,
  query?: string,
): DealCreator[] {
  const needle = query?.trim().toLowerCase() ?? "";
  return privateOfferChoices(
    profiles.filter((profile) => profile.userId !== viewerId),
    accounts,
  )
    .filter((profile) =>
      needle
        ? `${profile.displayName} ${profile.headline} ${profile.niche} ${profile.location}`
            .toLowerCase()
            .includes(needle)
        : true,
    )
    .map(withoutUserId);
}

/** One private offer target, only if it passes the same eligibility rules. */
export function findDealCreator(
  profiles: readonly InfluencerProfile[],
  accounts: readonly Profile[],
  viewerId: string,
  id: string,
): DealCreator | null {
  if (typeof id !== "string" || !id) return null;
  const match = searchDealCreators(profiles, accounts, viewerId).find((profile) => profile.id === id);
  return match ?? null;
}
