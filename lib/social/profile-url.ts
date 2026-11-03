import type { SocialPlatform } from "@/types/enums";

/**
 * Profile links only. A failed lookup must never become the stored value.
 * `profileUrl` used to prefix any string that lacked a scheme, so an error
 * page ("error. The requested URL ...") was saved as
 * https://www.instagram.com/error. The requested URL ...
 * and `tiktok.com/@name` was saved as https://www.tiktok.com/@tiktok.com/@name.
 */

const LABELS: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
};

const HOST: Record<SocialPlatform, RegExp> = {
  tiktok: /(^|\.)tiktok\.com$/i,
  instagram: /(^|\.)instagram\.com$/i,
  facebook: /(^|\.)((?:facebook|fb)\.com|fb\.me)$/i,
  youtube: /(^|\.)youtube\.com$/i,
  x: /(^|\.)(x|twitter)\.com$/i,
};

const HOST_PREFIX =
  /^(?:(?:www\.)?(?:vm\.|vt\.)?tiktok\.com|(?:www\.)?instagram\.com|(?:(?:www|m|web|mbasic)\.)?facebook\.com|(?:www\.)?fb\.com|(?:www\.)?fb\.me|(?:www\.)?youtube\.com|(?:www\.)?(?:x|twitter)\.com)(?:\/|$)/i;

const ERROR_TEXT =
  /\berror\b|requested url|not found|all we know|the request|could not|access denied|forbidden|something went wrong|page isn.t available/i;

/**
 * Error-page phrases are checked only for prose: a space, a newline, or a long paste.
 * A single handle such as mr.error or error.fit is not prose.
 */
const LONG_TEXT = 80;

const TIKTOK_HANDLE = /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{2,24}$/;
const INSTAGRAM_HANDLE = /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/;
const FACEBOOK_HANDLE = /^(?!.*\.\.)(?![.\-])(?!.*[.\-]$)[A-Za-z0-9.\-]{2,50}$/;
const YOUTUBE_HANDLE = /^(?!.*\.\.)(?![.\-])(?!.*[.\-]$)[A-Za-z0-9._-]{3,30}$/;
const X_HANDLE = /^[A-Za-z0-9_]{1,15}$/;

const RESERVED = new Set([
  "about",
  "accounts",
  "directory",
  "error",
  "errors",
  "explore",
  "help",
  "home",
  "legal",
  "login",
  "logout",
  "null",
  "p",
  "privacy",
  "profile.php",
  "reel",
  "reels",
  "settings",
  "share",
  "sharer",
  "signup",
  "stories",
  "terms",
  "undefined",
  "watch",
]);

/** Facebook paths that are sections, not a person or page profile. */
const FACEBOOK_NON_PROFILE = new Set([
  "ads",
  "ajax",
  "bookmarks",
  "checkpoint",
  "dating",
  "dialog",
  "directory",
  "events",
  "friends",
  "fundraisers",
  "gaming",
  "groups",
  "hashtag",
  "help",
  "home",
  "login",
  "marketplace",
  "media",
  "memories",
  "messages",
  "notes",
  "notifications",
  "pages",
  "people",
  "permalink.php",
  "photo.php",
  "photos",
  "places",
  "plugins",
  "policies",
  "privacy",
  "recover",
  "reel",
  "reels",
  "saved",
  "search",
  "settings",
  "share",
  "share.php",
  "sharer",
  "sharer.php",
  "stories",
  "story.php",
  "support",
  "terms",
  "video.php",
  "watch",
  "weather",
]);

/** Tabs on a channel home. youtube.com/shorts/<id> is a video and is not in this list as a first segment. */
const YOUTUBE_TABS = new Set([
  "about",
  "channels",
  "clips",
  "community",
  "featured",
  "live",
  "membership",
  "playlists",
  "podcasts",
  "posts",
  "releases",
  "shorts",
  "streams",
  "videos",
]);

export type SocialUrlResult =
  | { ok: true; url: string; handle: string }
  | { ok: false; message: string };

function label(platform: SocialPlatform): string {
  return LABELS[platform];
}

function article(name: string): string {
  return name === "Instagram" || name === "X" ? "an" : "a";
}

export function socialLookupBlockedMessage(platform: SocialPlatform): string {
  const name = label(platform);
  return `We could not open this ${name} profile automatically. ${name} often blocks these checks. Your link stays only when it is a valid profile URL.`;
}

/**
 * The note is for a lookup that ran and failed.
 * A link already saved on the profile does not get that note.
 */
export function socialLookupNote(input: {
  platform: SocialPlatform;
  attempted: boolean;
  failed: boolean;
  url: string;
  savedUrl?: string | null;
}): string | null {
  const saved = (input.savedUrl ?? "").trim();
  if (saved && input.url.trim() === saved) return null;
  if (!input.attempted || !input.failed) return null;
  return socialLookupBlockedMessage(input.platform);
}

/** Maps a finished lookup to a verification note. No fetch means no note. */
export function profileLookupMessage(
  platform: SocialPlatform,
  handle: string,
  lookup: { attempted: boolean; html: string | null },
): { verified: boolean; message: string | null } {
  if (!lookup.attempted) return { verified: false, message: null };
  const html = lookup.html ?? "";
  const needle = handle.trim().toLowerCase();
  if (!html || !needle || !html.toLowerCase().includes(needle)) {
    return { verified: false, message: socialLookupBlockedMessage(platform) };
  }
  return { verified: true, message: null };
}

function errorPageMessage(platform: SocialPlatform): string {
  const name = label(platform);
  return `${name} could not be checked, and this text looks like an error page. Nothing was written here. Paste a profile link or @handle.`;
}

function spaceMessage(platform: SocialPlatform): string {
  return `${label(platform)} links cannot contain spaces. Paste a profile link or @handle.`;
}

function genericMessage(platform: SocialPlatform): string {
  const name = label(platform);
  return `Enter ${article(name)} ${name} profile link or @handle.`;
}

function postMessage(platform: SocialPlatform): string {
  const name = label(platform);
  return `That is ${article(name)} ${name} post link, not a profile. Paste the profile link or @handle.`;
}

function hostMessage(platform: SocialPlatform): string {
  const name = label(platform);
  return `That link is not ${article(name)} ${name} profile.`;
}

function tiktokShortMessage(): string {
  return "Short TikTok links cannot be saved as a profile. Paste the full profile link, like https://www.tiktok.com/@handle.";
}

function facebookSectionMessage(): string {
  return "That Facebook link is not a profile. Paste a profile link like https://www.facebook.com/name, not groups, pages, watch, marketplace, or events.";
}

function isErrorPageText(value: string): boolean {
  if (!ERROR_TEXT.test(value)) return false;
  if (/\s/.test(value)) return true;
  return value.length >= LONG_TEXT;
}

function isTikTokShortHost(host: string): boolean {
  return /(?:^|\.)(?:vm|vt)\.tiktok\.com$/i.test(host);
}

function isFacebookSection(segment: string): boolean {
  return FACEBOOK_NON_PROFILE.has(segment.replace(/^@/, "").toLowerCase());
}

function isHostToken(segment: string): boolean {
  const bare = segment.replace(/^@/, "").toLowerCase();
  return HOST_PREFIX.test(`${bare}/`) || HOST_PREFIX.test(bare);
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function blockedHandle(handle: string): boolean {
  const lower = handle.toLowerCase();
  if (RESERVED.has(lower)) return true;
  if (isErrorPageText(handle)) return true;
  if (isHostToken(handle)) return true;
  return false;
}

function acceptHandle(platform: SocialPlatform, handle: string): boolean {
  if (!handle || /\s/.test(handle) || blockedHandle(handle)) return false;
  switch (platform) {
    case "tiktok":
      return TIKTOK_HANDLE.test(handle);
    case "instagram":
      return INSTAGRAM_HANDLE.test(handle);
    case "facebook":
      if (isFacebookSection(handle)) return false;
      return FACEBOOK_HANDLE.test(handle);
    case "youtube":
      return YOUTUBE_HANDLE.test(handle);
    case "x":
      return X_HANDLE.test(handle);
    default:
      return false;
  }
}

function canonical(platform: SocialPlatform, handle: string): string {
  switch (platform) {
    case "tiktok":
      return `https://www.tiktok.com/@${handle}`;
    case "instagram":
      return `https://www.instagram.com/${handle}`;
    case "facebook":
      return `https://www.facebook.com/${handle}`;
    case "youtube":
      return `https://www.youtube.com/@${handle}`;
    case "x":
      return `https://x.com/${handle}`;
    default:
      return "";
  }
}

function segmentsOf(url: URL): string[] | null {
  const raw = url.pathname.split("/").filter(Boolean);
  const decoded: string[] = [];
  for (const part of raw) {
    const next = decodeSegment(part);
    if (next == null || /\s/.test(next)) return null;
    decoded.push(next);
  }
  return decoded;
}

function profileParts(parts: string[]): string[] {
  return parts.filter((part) => !isHostToken(part));
}

function fromUrl(platform: SocialPlatform, url: URL): SocialUrlResult {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: genericMessage(platform) };
  }
  if (url.username || url.password) return { ok: false, message: hostMessage(platform) };
  if (url.port && url.port !== "443" && url.port !== "80") {
    return { ok: false, message: hostMessage(platform) };
  }
  const host = url.hostname.toLowerCase();
  if (!HOST[platform].test(host)) return { ok: false, message: hostMessage(platform) };
  if (platform === "tiktok" && isTikTokShortHost(host)) {
    return { ok: false, message: tiktokShortMessage() };
  }

  const decoded = segmentsOf(url);
  if (!decoded) {
    let decodedPath = url.pathname;
    try {
      decodedPath = decodeURIComponent(url.pathname);
    } catch {
      decodedPath = url.pathname;
    }
    return {
      ok: false,
      message: isErrorPageText(decodedPath) || isErrorPageText(url.pathname) ? errorPageMessage(platform) : genericMessage(platform),
    };
  }
  const parts = profileParts(decoded);

  if (platform === "facebook" && decoded[0]?.toLowerCase() === "profile.php") {
    const id = url.searchParams.get("id")?.trim() ?? "";
    if (!/^\d{5,20}$/.test(id)) return { ok: false, message: genericMessage(platform) };
    return {
      ok: true,
      handle: id,
      url: `https://www.facebook.com/profile.php?id=${id}`,
    };
  }

  if (platform === "facebook" && parts[0]?.toLowerCase() === "people" && parts.length >= 3) {
    const id = parts[parts.length - 1] ?? "";
    if (/^\d{5,20}$/.test(id)) {
      return {
        ok: true,
        handle: id,
        url: `https://www.facebook.com/profile.php?id=${id}`,
      };
    }
  }

  if (platform === "facebook" && parts[0] && isFacebookSection(parts[0])) {
    return { ok: false, message: facebookSectionMessage() };
  }

  if (platform === "youtube") {
    const channel = youtubeChannel(parts);
    if (channel) return channel;
  }

  const head = (parts[0] ?? "").replace(/^@/, "").toLowerCase();
  const postHeads = new Set(["video", "reel", "reels", "p", "stories", "watch", "shorts", "playlist", "embed", "status", "photo", "photos", "share", "sharer"]);
  if (postHeads.has(head) || parts.includes("video") || parts.includes("status")) {
    return { ok: false, message: postMessage(platform) };
  }

  if (parts.length !== 1) return { ok: false, message: genericMessage(platform) };
  const handle = (parts[0] ?? "").replace(/^@/, "");
  if (platform === "facebook" && isFacebookSection(handle)) {
    return { ok: false, message: facebookSectionMessage() };
  }
  if (!acceptHandle(platform, handle)) {
    return {
      ok: false,
      message: isErrorPageText(handle) ? errorPageMessage(platform) : genericMessage(platform),
    };
  }
  return { ok: true, handle, url: canonical(platform, handle) };
}

/** Channel URL, including /videos, /shorts, /about and the other channel tabs. Null when this is not a channel path. */
function youtubeChannel(parts: string[]): SocialUrlResult | null {
  const last = parts.length >= 2 ? (parts[parts.length - 1] ?? "").toLowerCase() : "";
  const usedTab = YOUTUBE_TABS.has(last);
  const core = usedTab ? parts.slice(0, -1) : parts;

  if (core[0]?.toLowerCase() === "channel" && core.length === 2) {
    const id = core[1] ?? "";
    if (/^UC[A-Za-z0-9_-]{20,}$/.test(id)) {
      return { ok: true, handle: id, url: `https://www.youtube.com/channel/${id}` };
    }
    return { ok: false, message: genericMessage("youtube") };
  }

  if ((core[0]?.toLowerCase() === "c" || core[0]?.toLowerCase() === "user") && core.length === 2) {
    const handle = core[1] ?? "";
    if (!acceptHandle("youtube", handle)) return { ok: false, message: genericMessage("youtube") };
    return { ok: true, handle, url: canonical("youtube", handle) };
  }

  if (core.length !== 1 || (!usedTab && parts.length !== 1)) return null;
  const raw = (core[0] ?? "").replace(/^@/, "");
  const postHeads = new Set(["video", "reel", "reels", "p", "stories", "watch", "shorts", "playlist", "embed", "status", "photo", "photos", "share", "sharer"]);
  if (!usedTab && postHeads.has(raw.toLowerCase())) return null;
  if (!acceptHandle("youtube", raw)) {
    return {
      ok: false,
      message: isErrorPageText(raw) ? errorPageMessage("youtube") : genericMessage("youtube"),
    };
  }
  return { ok: true, handle: raw, url: canonical("youtube", raw) };
}

function asUrl(raw: string): URL | null {
  const stripped = raw.replace(/^@/, "");
  const withScheme = /^https?:\/\//i.test(raw)
    ? raw
    : HOST_PREFIX.test(stripped)
      ? `https://${stripped}`
      : null;
  if (!withScheme) return null;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

export function normalizeSocialProfileUrl(platform: SocialPlatform, raw: string): SocialUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, url: "", handle: "" };
  if (/\s/.test(trimmed)) {
    return {
      ok: false,
      message: isErrorPageText(trimmed) ? errorPageMessage(platform) : spaceMessage(platform),
    };
  }

  const url = asUrl(trimmed);
  if (url) return fromUrl(platform, url);
  if (isErrorPageText(trimmed)) return { ok: false, message: errorPageMessage(platform) };

  const handle = trimmed.replace(/^@/, "");
  if (platform === "facebook" && isFacebookSection(handle)) {
    return { ok: false, message: facebookSectionMessage() };
  }
  if (!acceptHandle(platform, handle)) return { ok: false, message: genericMessage(platform) };
  return { ok: true, handle, url: canonical(platform, handle) };
}

/** Empty when the stored value is missing or not a profile URL for that platform. */
export function displaySocialUrl(platform: SocialPlatform, stored: string | null | undefined): string {
  if (!stored?.trim()) return "";
  const parsed = normalizeSocialProfileUrl(platform, stored);
  return parsed.ok ? parsed.url : "";
}

export function visibleSocial(platform: SocialPlatform, stored: string | null | undefined): boolean {
  return displaySocialUrl(platform, stored).length > 0;
}

/**
 * Handle for bio checks. Host-shaped path segments are skipped, so
 * tiktok.com/@name and https://www.tiktok.com/@tiktok.com/@name both yield name.
 * Error-page text yields null.
 */
export function looseProfileHandle(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed) || isErrorPageText(trimmed)) return null;
  const url = asUrl(trimmed);
  if (url) {
    const host = url.hostname.toLowerCase();
    const platform = (Object.keys(HOST) as SocialPlatform[]).find((item) => HOST[item].test(host));
    if (!platform) return null;
    const parsed = fromUrl(platform, url);
    if (!parsed.ok || !parsed.handle) return null;
    if (platform === "facebook" && /^\d+$/.test(parsed.handle)) return parsed.handle;
    if (!/^[A-Za-z0-9._]{2,40}$/.test(parsed.handle)) return null;
    return parsed.handle;
  }
  const handle = trimmed.replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{2,40}$/.test(handle) || blockedHandle(handle)) return null;
  return handle;
}
