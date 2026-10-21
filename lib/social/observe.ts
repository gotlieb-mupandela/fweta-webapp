import type { SocialPlatform } from "@/types/enums";

import { fetchApifyObservation, fetchApifyProfileBio } from "./apify";
import {
  apifyViewsEnabled,
  instagramViewsEnabled,
  tiktokViewsEnabled,
  xViewsEnabled,
  youtubeViewsEnabled,
} from "./flags";
import type { ViewObservation } from "./observation";
import { fetchInstagramOfficial, fetchTikTokOfficial, fetchXOfficial } from "./official";
import { fetchYouTubeChannelBio, fetchYouTubeObservation } from "./youtube";

export function realViewProvidersConfigured(): boolean {
  return (
    youtubeViewsEnabled() ||
    tiktokViewsEnabled() ||
    instagramViewsEnabled() ||
    xViewsEnabled() ||
    apifyViewsEnabled()
  );
}

/**
 * Returns null unless that platform's view flag is exactly "true".
 * A null result is unknown. Callers must not invent a count.
 */
export async function observePost(
  platform: SocialPlatform,
  postUrl: string,
): Promise<ViewObservation | null> {
  if (platform === "tiktok" && tiktokViewsEnabled()) {
    return fetchTikTokOfficial(postUrl);
  }
  if (platform === "instagram" && instagramViewsEnabled()) {
    return fetchInstagramOfficial(postUrl);
  }
  if (platform === "x" && xViewsEnabled()) {
    return fetchXOfficial(postUrl);
  }
  if (platform === "youtube" && youtubeViewsEnabled()) {
    const youtube = await fetchYouTubeObservation(postUrl);
    if (youtube) return youtube;
  }
  if (apifyViewsEnabled()) return fetchApifyObservation(postUrl);
  return null;
}

export function localBioConfirmAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VIEW_BIO_LOCAL === "1";
}

export async function observeBio(
  platform: SocialPlatform,
  handle: string,
): Promise<{ bio: string | null; source: string | null }> {
  if (platform === "youtube" && youtubeViewsEnabled()) {
    const bio = await fetchYouTubeChannelBio(handle);
    if (bio != null) return { bio, source: "youtube-data" };
  }
  if (apifyViewsEnabled() && process.env.APIFY_PROFILE_ACTOR_ID?.trim()) {
    try {
      const bio = await fetchApifyProfileBio(platform, handle);
      if (bio != null) return { bio, source: "apify" };
    } catch {
      return { bio: null, source: null };
    }
  }
  return { bio: null, source: null };
}

export function bioContainsCode(bio: string, code: string): boolean {
  return bio.toLowerCase().includes(code.toLowerCase());
}
