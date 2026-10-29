import { readStore } from "@/lib/db/store";

/** Published profiles only. Does not create or publish profiles. */
export async function listPublicInfluencers(filters?: { q?: string; niche?: string }) {
  const store = await readStore();
  return store.influencerProfiles
    .filter((profile) => profile.published)
    .filter((profile) =>
      filters?.niche ? profile.niche.toLowerCase().includes(filters.niche.toLowerCase()) : true,
    )
    .filter((profile) =>
      filters?.q
        ? `${profile.displayName} ${profile.headline} ${profile.niche} ${profile.bio}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getPublicInfluencer(slug: string) {
  const store = await readStore();
  const profile = store.influencerProfiles.find((item) => item.slug === slug && item.published);
  if (!profile) return null;
  const rates = store.rateCards.filter((item) => item.influencerProfileId === profile.id && item.active);
  return { profile, rates };
}
