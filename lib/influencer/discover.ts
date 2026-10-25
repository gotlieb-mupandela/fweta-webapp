import "server-only";

import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { DatabaseStore, Profile } from "@/lib/db/types";
import { slugify } from "@/lib/utils";

function isCreatorAccount(profile: Profile): boolean {
  return (
    !profile.suspended &&
    profile.onboardingCompletedAt !== null &&
    (profile.roles.includes("influencer") || profile.roles.includes("clipper"))
  );
}

function needsDiscoverableRepair(store: DatabaseStore): boolean {
  return store.profiles.some((account) => {
    if (!isCreatorAccount(account)) return false;
    const existing = store.influencerProfiles.find((profile) => profile.userId === account.id);
    if (!existing) return true;
    // Onboarding used to save published:false without a later edit.
    return !existing.published && existing.updatedAt === existing.createdAt;
  });
}

/**
 * Brands can only book a published profile. Create one for finished creators
 * who never got one. Server-only so a client cannot invoke the write.
 */
export async function ensureDiscoverableCreators() {
  const snapshot = await readStore();
  if (!needsDiscoverableRepair(snapshot)) return;

  const now = nowIso();
  await updateStore((store) => {
    for (const account of store.profiles) {
      if (!isCreatorAccount(account)) continue;
      const existing = store.influencerProfiles.find((profile) => profile.userId === account.id);
      if (existing) {
        if (!existing.published && existing.updatedAt === existing.createdAt) {
          existing.published = true;
        }
        continue;
      }

      const base = slugify(account.displayName) || `creator-${account.id.slice(0, 6)}`;
      let slug = base;
      let n = 1;
      while (store.influencerProfiles.some((profile) => profile.slug === slug)) {
        slug = `${base}-${n++}`;
      }
      const niche =
        account.niche?.trim() || (account.roles.includes("influencer") ? "Creator" : "Clipper");
      const headline = niche.length >= 5 ? niche : `${account.displayName} on fweta`;
      const bio =
        account.bio.trim().length >= 10 ? account.bio.trim() : `${account.displayName} creates on fweta.`;

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
    }
  });
}

export async function listPublicInfluencers(filters?: { q?: string; niche?: string }) {
  await ensureDiscoverableCreators();
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
  await ensureDiscoverableCreators();
  const store = await readStore();
  const profile = store.influencerProfiles.find((p) => p.slug === slug && p.published);
  if (!profile) return null;
  const rates = store.rateCards.filter(
    (r) => r.influencerProfileId === profile.id && r.active,
  );
  return { profile, rates };
}
