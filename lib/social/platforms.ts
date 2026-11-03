import type { SocialPlatform } from "@/types/enums";

import { normalizeSocialProfileUrl } from "@/lib/social/profile-url";

/** Canonical platform order used by forms, filters, and the admin dossier. */
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  "tiktok",
  "youtube",
  "instagram",
  "facebook",
  "x",
];

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
};

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/** Canonical profile URL, or "" when the value is not a profile link for that platform. */
export function profileUrl(platform: SocialPlatform, handleOrUrl: string): string {
  const parsed = normalizeSocialProfileUrl(platform, handleOrUrl);
  return parsed.ok ? parsed.url : "";
}
