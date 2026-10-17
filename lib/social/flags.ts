/** Official view fetchers stay off unless the flag is exactly "true". An API key alone does not enable them. */

export function youtubeViewsEnabled(): boolean {
  return process.env.YOUTUBE_VIEWS_ENABLED === "true";
}

export function tiktokViewsEnabled(): boolean {
  return process.env.TIKTOK_VIEWS_ENABLED === "true";
}

export function instagramViewsEnabled(): boolean {
  return process.env.INSTAGRAM_VIEWS_ENABLED === "true";
}

export function xViewsEnabled(): boolean {
  return process.env.X_VIEWS_ENABLED === "true";
}

export function apifyViewsEnabled(): boolean {
  return process.env.APIFY_VIEWS_ENABLED === "true";
}
