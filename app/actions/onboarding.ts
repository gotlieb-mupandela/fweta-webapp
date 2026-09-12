"use server";

import { revalidatePath } from "next/cache";

import {
  getProfileById,
  refreshSessionFromProfile,
  requireSession,
} from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import type { InfluencerProfile, ProfileSocials } from "@/lib/db/types";
import { onboardingCompleteSchema } from "@/lib/validations/onboarding";
import { slugify } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

function normalizeHandle(platform: SocialPlatform, raw: string): string {
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "");
  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "youtube":
      return handle.startsWith("@") || handle.includes("/")
        ? `https://www.youtube.com/${handle.replace(/^@/, "@")}`
        : `https://www.youtube.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    default:
      return value;
  }
}

function socialsFromAnswer(
  platform: SocialPlatform,
  handle: string,
): ProfileSocials {
  const url = normalizeHandle(platform, handle);
  return { [platform]: url };
}

export async function getOnboardingState() {
  const session = await requireSession();
  const profile = await getProfileById(session.id);
  if (!profile) return { ok: false as const, error: "Profile not found." };
  return {
    ok: true as const,
    needsOnboarding: needsOnboarding(profile),
    roles: profile.roles,
    email: profile.email,
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
  };
}

export async function completeOnboardingAction(raw: unknown) {
  const session = await requireSession();
  const parsed = onboardingCompleteSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid onboarding details.";
    return { ok: false as const, error: msg };
  }

  const data = parsed.data;
  const displayName = `${data.firstName} ${data.lastName}`.trim();
  const socials = socialsFromAnswer(data.socialPlatform, data.socialHandle);
  const now = nowIso();

  let updatedId = session.id;

  await updateStore((s) => {
    const profile = s.profiles.find((p) => p.id === session.id);
    if (!profile) throw new Error("Profile not found.");

    profile.firstName = data.firstName;
    profile.lastName = data.lastName;
    profile.phone = data.phone.replace(/\s+/g, " ").trim();
    profile.displayName = displayName;
    profile.socials = { ...(profile.socials ?? {}), ...socials };
    profile.primaryPlatform = data.primaryPlatform ?? data.socialPlatform;
    profile.updatedAt = now;
    profile.onboardingCompletedAt = now;

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

      const existing = s.influencerProfiles.find((p) => p.userId === session.id);
      if (!existing) {
        const baseSlug = slugify(displayName);
        let slug = baseSlug || `creator-${session.id.slice(0, 6)}`;
        let i = 1;
        while (s.influencerProfiles.some((p) => p.slug === slug)) {
          slug = `${baseSlug}-${i++}`;
        }
        const influencer: InfluencerProfile = {
          id: newId(),
          userId: session.id,
          slug,
          displayName,
          headline: niche.length >= 5 ? niche : `${niche} creator`,
          bio: `${displayName} is building on fweta.`,
          niche,
          location,
          avatarUrl: null,
          socials,
          featuredWork: [],
          published: false,
          createdAt: now,
          updatedAt: now,
        };
        s.influencerProfiles.push(influencer);
      } else {
        Object.assign(existing, {
          displayName,
          niche,
          location,
          socials: { ...existing.socials, ...socials },
          updatedAt: now,
        });
      }
    }

    updatedId = profile.id;
  });

  const updatedProfile = await getProfileById(updatedId);
  if (!updatedProfile) {
    return { ok: false as const, error: "Could not save onboarding." };
  }

  await refreshSessionFromProfile(updatedProfile);
  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/influencers");
  return { ok: true as const };
}
