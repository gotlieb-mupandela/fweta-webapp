import { instagramViewsEnabled, tiktokViewsEnabled, xViewsEnabled } from "./flags";
import type { ViewObservation } from "./observation";

export function tiktokOfficialEnabled(): boolean {
  return tiktokViewsEnabled();
}

export function instagramOfficialEnabled(): boolean {
  return instagramViewsEnabled();
}

/** Stub. Does not call the network. Stays off unless TIKTOK_VIEWS_ENABLED is exactly "true". */
export async function fetchTikTokOfficial(postUrl: string): Promise<ViewObservation | null> {
  void postUrl;
  if (!tiktokViewsEnabled()) return null;
  return null;
}

/** Stub. Does not call the network. Stays off unless INSTAGRAM_VIEWS_ENABLED is exactly "true". */
export async function fetchInstagramOfficial(postUrl: string): Promise<ViewObservation | null> {
  void postUrl;
  if (!instagramViewsEnabled()) return null;
  return null;
}

/** Stub. Does not call the network. Stays off unless X_VIEWS_ENABLED is exactly "true". */
export async function fetchXOfficial(postUrl: string): Promise<ViewObservation | null> {
  void postUrl;
  if (!xViewsEnabled()) return null;
  return null;
}
