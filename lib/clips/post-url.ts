import type { SocialPlatform } from "@/types/enums";

const HOSTS: Record<SocialPlatform, readonly string[]> = {
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.watch"],
  x: ["x.com", "twitter.com"],
};

/** True when the post URL host belongs to the platform the creator selected. */
export function postUrlMatchesPlatform(url: string, platform: SocialPlatform): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return false;
  }
  if (host.startsWith("www.")) host = host.slice(4);
  const allowed = HOSTS[platform];
  if (!allowed) return false;
  return allowed.some((name) => host === name || host.endsWith(`.${name}`));
}
