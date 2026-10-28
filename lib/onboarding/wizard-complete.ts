import { randomUUID } from "crypto";

import type { DatabaseStore, InfluencerProfile, ProfileSocials } from "@/lib/db/types";
import { slugify } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export type WizardCompletionInput = {
  firstName: string;
  lastName: string;
  phone: string;
  socials: ProfileSocials;
  companyName?: string;
  website?: string;
  niche?: string;
  location?: string;
  primaryPlatform?: SocialPlatform;
};

const PLATFORM_ORDER: SocialPlatform[] = ["tiktok", "instagram", "facebook", "youtube", "x"];

function firstFilledPlatform(socials: ProfileSocials): SocialPlatform | undefined {
  return PLATFORM_ORDER.find((platform) => Boolean(socials[platform]));
}

/**
 * Apply a finished wizard onto the store. Running it twice updates the same
 * profile and influencer row. The first completion time stays put. It does
 * not insert a second row.
 */
export function applyWizardCompletion(
  store: DatabaseStore,
  userId: string,
  data: WizardCompletionInput,
  now: string,
): void {
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) throw new Error("Profile not found.");

  const displayName = `${data.firstName} ${data.lastName}`.trim();
  profile.firstName = data.firstName;
  profile.lastName = data.lastName;
  profile.phone = data.phone.replace(/\s+/g, " ").trim();
  profile.displayName = displayName;
  profile.socials = { ...(profile.socials ?? {}), ...data.socials };
  const pickedPlatform = data.primaryPlatform ?? firstFilledPlatform(data.socials);
  if (pickedPlatform) profile.primaryPlatform = pickedPlatform;
  profile.updatedAt = now;
  // A timed-out Finish can still commit. The retry must keep that first moment.
  if (!profile.onboardingCompletedAt) profile.onboardingCompletedAt = now;

  if (profile.roles.includes("brand")) {
    const company = data.companyName?.trim();
    if (company) profile.companyName = company;
    const site = data.website?.trim();
    if (site) {
      profile.website = /^https?:\/\//i.test(site) ? site : `https://${site}`;
    }
    if (company && profile.primaryRole === "brand") {
      profile.displayName = company;
    }
  }

  if (profile.roles.includes("influencer") || profile.roles.includes("clipper")) {
    const niche = data.niche?.trim();
    if (niche) profile.niche = niche;
  }

  if (profile.roles.includes("influencer")) {
    const location = data.location?.trim() || "Namibia";
    profile.location = location;
    const niche = data.niche?.trim() || "Creator";
    profile.niche = niche;

    const existing = store.influencerProfiles.find((item) => item.userId === userId);
    if (!existing) {
      const baseSlug = slugify(displayName);
      let slug = baseSlug || `creator-${userId.slice(0, 6)}`;
      let i = 1;
      while (store.influencerProfiles.some((item) => item.slug === slug)) {
        slug = `${baseSlug}-${i++}`;
      }
      const influencer: InfluencerProfile = {
        id: randomUUID(),
        userId,
        slug,
        displayName,
        headline: niche.length >= 5 ? niche : `${niche} creator`,
        bio: `${displayName} is building on fweta.`,
        niche,
        location,
        avatarUrl: null,
        socials: data.socials,
        featuredWork: [],
        published: true,
        createdAt: now,
        updatedAt: now,
      };
      store.influencerProfiles.push(influencer);
    } else {
      Object.assign(existing, {
        displayName,
        niche,
        location,
        socials: { ...existing.socials, ...data.socials },
        createdAt: existing.createdAt,
        updatedAt: now,
      });
    }
  }
}
