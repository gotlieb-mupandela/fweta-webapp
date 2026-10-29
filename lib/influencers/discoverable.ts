import { newId, nowIso } from "@/lib/db/store";
import type { DatabaseStore, Profile } from "@/lib/db/types";
import { slugify } from "@/lib/utils";

function isCreatorAccount(profile: Profile): boolean {
  return (
    !profile.suspended &&
    profile.onboardingCompletedAt !== null &&
    (profile.roles.includes("influencer") || profile.roles.includes("clipper"))
  );
}

/**
 * Repair finished creators who never got a public profile.
 * Call this from the housekeeping cron only. A public page view must not write.
 */
export function repairDiscoverableCreators(store: DatabaseStore, now = nowIso()): number {
  let changed = 0;
  for (const account of store.profiles) {
    if (!isCreatorAccount(account)) continue;
    const existing = store.influencerProfiles.find((profile) => profile.userId === account.id);
    if (existing) {
      if (!existing.published && existing.updatedAt === existing.createdAt) {
        existing.published = true;
        changed += 1;
      }
      continue;
    }

    const base = slugify(account.displayName) || `creator-${account.id.slice(0, 6)}`;
    let slug = base;
    let n = 1;
    while (store.influencerProfiles.some((profile) => profile.slug === slug)) {
      slug = `${base}-${n++}`;
    }
    const niche = account.niche?.trim() || (account.roles.includes("influencer") ? "Creator" : "Clipper");
    const headline = niche.length >= 5 ? niche : `${account.displayName} on fweta`;
    const bio = account.bio.trim().length >= 10 ? account.bio.trim() : `${account.displayName} creates on fweta.`;
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
    changed += 1;
  }
  return changed;
}
