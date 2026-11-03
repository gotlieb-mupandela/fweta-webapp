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
  facebook: /(^|\.)(facebook|fb)\.com$/i,
  youtube: /(^|\.)youtube\.com$/i,
  x: /(^|\.)(x|twitter)\.com$/i,
};

const HOST_PREFIX =
  /^(www\.)?(tiktok\.com|instagram\.com|facebook\.com|fb\.com|youtube\.com|x\.com|twitter\.com)(\/|$)/i;

const ERROR_TEXT =
  /\berror\b|requested url|not found|all we know|the request|could not|access denied|forbidden|something went wrong|page isn.t available/i;

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
  if (ERROR_TEXT.test(handle)) return true;
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

  const decoded = segmentsOf(url);
  if (!decoded) {
    return {
      ok: false,
      message: ERROR_TEXT.test(url.pathname) ? errorPageMessage(platform) : genericMessage(platform),
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

  if (platform === "youtube" && parts[0]?.toLowerCase() === "channel" && parts.length === 2) {
    const id = parts[1] ?? "";
    if (/^UC[A-Za-z0-9_-]{20,}$/.test(id)) {
      return { ok: true, handle: id, url: `https://www.youtube.com/channel/${id}` };
    }
    return { ok: false, message: genericMessage(platform) };
  }

  if (platform === "youtube" && (parts[0]?.toLowerCase() === "c" || parts[0]?.toLowerCase() === "user") && parts.length === 2) {
    const handle = parts[1] ?? "";
    if (!acceptHandle(platform, handle)) return { ok: false, message: genericMessage(platform) };
    return { ok: true, handle, url: canonical(platform, handle) };
  }

  const head = (parts[0] ?? "").toLowerCase();
  const postHeads = new Set(["video", "reel", "reels", "p", "stories", "watch", "shorts", "playlist", "embed", "status", "photo", "photos", "share", "sharer"]);
  if (postHeads.has(head) || parts.includes("video") || parts.includes("status")) {
    return { ok: false, message: postMessage(platform) };
  }

  if (parts.length !== 1) return { ok: false, message: genericMessage(platform) };
  const handle = (parts[0] ?? "").replace(/^@/, "");
  if (!acceptHandle(platform, handle)) {
    return {
      ok: false,
      message: ERROR_TEXT.test(handle) ? errorPageMessage(platform) : genericMessage(platform),
    };
  }
  return { ok: true, handle, url: canonical(platform, handle) };
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
      message: ERROR_TEXT.test(trimmed) ? errorPageMessage(platform) : spaceMessage(platform),
    };
  }
  if (ERROR_TEXT.test(trimmed)) return { ok: false, message: errorPageMessage(platform) };

  const url = asUrl(trimmed);
  if (url) return fromUrl(platform, url);

  const handle = trimmed.replace(/^@/, "");
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
  if (!trimmed || /\s/.test(trimmed) || ERROR_TEXT.test(trimmed)) return null;
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
