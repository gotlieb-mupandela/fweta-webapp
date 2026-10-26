import "server-only";

import { newId, readStore } from "@/lib/db/store";
import type { DatabaseStore, InfluencerProfile, Profile } from "@/lib/db/types";
import { slugify } from "@/lib/utils";

/** Finished means the timestamp is stored. Null and missing both stay private. */
export function onboardingFinished(profile: Profile): boolean {
  return typeof profile.onboardingCompletedAt === "string" && profile.onboardingCompletedAt.trim().length > 0;
}

/** A saved profile with published off is a hide. A missing profile is not. */
export function influencerProfileHidden(profile: InfluencerProfile): boolean {
  return profile.published === false;
}

function canCreateDiscoverableProfile(account: Profile): boolean {
  return (
    !account.suspended &&
    onboardingFinished(account) &&
    (account.roles.includes("influencer") || account.roles.includes("clipper"))
  );
}

/**
 * Create a published profile for one finished creator who does not have one
 * and has not hidden an existing profile. Does not read or write the store
 * itself. Callers run this inside their own updateStore.
 * Returns true when a profile row was created.
 */
export function repairDiscoverableCreator(store: DatabaseStore, userId: string, now: string): boolean {
  const account = store.profiles.find((profile) => profile.id === userId);
  if (!account || !canCreateDiscoverableProfile(account)) return false;
  const existing = store.influencerProfiles.find((profile) => profile.userId === account.id);
  if (existing && influencerProfileHidden(existing)) return false;
  if (existing) return false;
  return insertDiscoverableProfile(store, account, now);
}

/** Same gate as repairDiscoverableCreator, for every account. Housekeeping only. */
export function repairDiscoverableCreators(store: DatabaseStore, now: string): number {
  let created = 0;
  for (const account of store.profiles) {
    if (repairDiscoverableCreator(store, account.id, now)) created += 1;
  }
  return created;
}

function insertDiscoverableProfile(store: DatabaseStore, account: Profile, now: string): boolean {
  const base = slugify(account.displayName) || `creator-${account.id.slice(0, 6)}`;
  let slug = base;
  let n = 1;
  while (store.influencerProfiles.some((profile) => profile.slug === slug)) {
    slug = `${base}-${n++}`;
  }
  const niche = account.niche?.trim() || (account.roles.includes("influencer") ? "Creator" : "Clipper");
  const headline = niche.length >= 5 ? niche : `${account.displayName} on fweta`;
  const bioText = account.bio?.trim() ?? "";
  const bio = bioText.length >= 10 ? bioText : `${account.displayName} creates on fweta.`;

  store.influencerProfiles.push({
    id: newId(),
    userId: account.id,
    slug,
    displayName: account.displayName,
    headline,
    bio,
    niche,
    location: account.location?.trim() || "Namibia",
    avatarUrl: account.avatarUrl,
    socials: { ...(account.socials ?? {}) },
    featuredWork: [],
    published: true,
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

export async function listPublicInfluencers(filters?: { q?: string; niche?: string }) {
  const store = await readStore();
  return store.influencerProfiles
    .filter((p) => p.published)
    .filter((p) => (filters?.niche ? p.niche.toLowerCase().includes(filters.niche.toLowerCase()) : true))
    .filter((p) =>
      filters?.q
        ? `${p.displayName} ${p.headline} ${p.niche} ${p.bio}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getPublicInfluencer(slug: string) {
  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.slug === slug && p.published);
  if (!profile) return null;
  const rates = store.rateCards.filter(
    (r) => r.influencerProfileId === profile.id && r.active,
  );
  return { profile, rates };
}
