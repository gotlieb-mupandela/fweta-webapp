import type { SocialPlatform } from "@/types/enums";

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

export function profileUrl(platform: SocialPlatform, handleOrUrl: string): string {
  const trimmed = handleOrUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "youtube":
      return handle.startsWith("@") || handle.includes("/")
        ? `https://www.youtube.com/${handle.replace(/^@/, "@")}`
        : `https://www.youtube.com/@${handle}`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
    case "x":
      return `https://x.com/${handle}`;
  }
}
