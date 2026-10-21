import type { SocialPlatform } from "@/types/enums";

/** How a clip should be posted on each network. Original briefs, not copied site copy. */
export type PlatformGuide = {
  label: string;
  /** Short name used on filters and toggles. */
  mark: string;
  surface: string;
  frame: string;
  length: string;
  hook: string;
  caption: string;
  submit: string;
  chipClass: string;
};

export const PLATFORM_GUIDES: Record<SocialPlatform, PlatformGuide> = {
  tiktok: {
    label: "TikTok",
    mark: "9:16",
    surface: "TikTok",
    frame: "Vertical 9:16",
    length: "15 to 35 seconds",
    hook: "Start on the action. The first two seconds decide if the clip is watched.",
    caption: "One short line, the brand mention, and a sponsored disclosure.",
    submit: "Paste the link to the public video.",
    chipClass: "bg-foreground text-white",
  },
  instagram: {
    label: "Instagram",
    mark: "Reels",
    surface: "Instagram Reels",
    frame: "Vertical 9:16, cover readable at a glance",
    length: "15 to 30 seconds",
    hook: "The cover and the first frame should say the same thing.",
    caption: "Put the mention and the disclosure in the caption as well as on the video.",
    submit: "Paste the link to the Reel.",
    chipClass: "bg-gold-soft text-foreground",
  },
  youtube: {
    label: "YouTube",
    mark: "Shorts",
    surface: "YouTube Shorts",
    frame: "Vertical 9:16",
    length: "Under 60 seconds",
    hook: "Title it the way someone would search for it. Keep any logo readable.",
    caption: "Use the title and the description for the mention and the disclosure.",
    submit: "Paste the link to the Short.",
    chipClass: "bg-danger-soft text-danger",
  },
  facebook: {
    label: "Facebook",
    mark: "Reels",
    surface: "Facebook Reels",
    frame: "Vertical 9:16",
    length: "15 to 60 seconds",
    hook: "Open on the product or the line. The first frame has to work with the sound off.",
    caption: "Put the mention and the disclosure in the caption.",
    submit: "Paste the link to the public Reel.",
    chipClass: "bg-surface-2 text-foreground",
  },
  x: {
    label: "X",
    mark: "Post",
    surface: "X post",
    frame: "Vertical or square, uploaded on X",
    length: "Under 60 seconds",
    hook: "The post text is the hook. The video supports that sentence.",
    caption: "The mention and the disclosure belong in the post itself.",
    submit: "Paste the link to your own post.",
    chipClass: "bg-surface-2 text-foreground",
  },
};

export const RATE_TYPE_LABEL: Record<string, string> = {
  per_post: "Per post",
  per_reel: "Per Reel",
  per_1k_views: "Per 1,000 views",
  package: "Package",
  ugc_flat: "UGC flat fee",
};

export type DiscoverQuery = {
  q?: string;
  type?: string;
  platform?: string;
  category?: string;
  sort?: string;
  payModel?: string;
  country?: string;
  minRate?: string;
  minBudget?: string;
};

export function isSocialPlatform(value: string | undefined): value is SocialPlatform {
  return value === "tiktok" || value === "instagram" || value === "facebook" || value === "youtube" || value === "x";
}

export function ratePlatformLabel(platform: SocialPlatform | "multi"): string {
  if (platform === "multi") return "Any platform";
  return PLATFORM_GUIDES[platform].label;
}

/** Keep the other discover filters when the creator switches network. */
export function platformFilterHref(basePath: string, params: DiscoverQuery, platform: string): string {
  const search = new URLSearchParams();
  const entries: [string, string | undefined][] = [
    ["q", params.q],
    ["type", params.type],
    ["category", params.category],
    ["sort", params.sort],
    ["payModel", params.payModel],
    ["country", params.country],
    ["minRate", params.minRate],
    ["minBudget", params.minBudget],
    ["platform", platform || undefined],
  ];
  for (const [key, value] of entries) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}
