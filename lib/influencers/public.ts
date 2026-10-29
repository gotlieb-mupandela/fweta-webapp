import { readStore } from "@/lib/db/store";
import { publicCreatorChoices } from "@/lib/public/creators";

/** Published, non test, non admin, non suspended profiles. Does not create or publish profiles. */
export async function listPublicInfluencers(filters?: { q?: string; niche?: string }) {
  const store = await readStore();
  const niche = filters?.niche?.trim().toLowerCase() ?? "";
  const q = filters?.q?.trim().toLowerCase() ?? "";
  return publicCreatorChoices(store.influencerProfiles, store.profiles)
    .filter((profile) => (niche ? profile.niche.toLowerCase().includes(niche) : true))
    .filter((profile) =>
      q ? `${profile.displayName} ${profile.headline} ${profile.niche} ${profile.bio}`.toLowerCase().includes(q) : true,
    );
}

export async function getPublicInfluencer(slug: string) {
  const store = await readStore();
  const profile = publicCreatorChoices(store.influencerProfiles, store.profiles).find((item) => item.slug === slug);
  if (!profile) return null;
  const rates = store.rateCards.filter((item) => item.influencerProfileId === profile.id && item.active);
  return { profile, rates };
}

/** True when /influencers/[slug] would render (not a 404) for this profile. */
export async function isPublicInfluencerSlug(slug: string | undefined | null): Promise<boolean> {
  if (!slug) return false;
  return (await getPublicInfluencer(slug)) !== null;
}
