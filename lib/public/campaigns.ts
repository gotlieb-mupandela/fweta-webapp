import type { Campaign } from "@/lib/db/types";
import { isSocialPlatform } from "@/lib/platforms/guides";
import { campaignIsDiscoverable, remainingBudgetCents } from "@/lib/rewards/content-rewards";
import type { SocialPlatform } from "@/types/enums";

const PLATFORM_ALIASES: Record<string, SocialPlatform> = {
  tiktok: "tiktok",
  tik_tok: "tiktok",
  instagram: "instagram",
  ig: "instagram",
  youtube: "youtube",
  youtube_shorts: "youtube",
  shorts: "youtube",
  facebook: "facebook",
  fb: "facebook",
  x: "x",
  twitter: "x",
};

export function normalizePlatform(value: string | undefined | null): SocialPlatform | null {
  if (!value) return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (isSocialPlatform(key)) return key;
  return PLATFORM_ALIASES[key] ?? null;
}

/** Empty filter matches every campaign. An unknown platform matches none. */
export function campaignMatchesPlatform(
  platforms: readonly string[] | string | null | undefined,
  platform: string | undefined | null,
): boolean {
  const raw = platform?.trim() ?? "";
  if (!raw) return true;
  const wanted = normalizePlatform(raw);
  if (!wanted) return false;
  const list = Array.isArray(platforms)
    ? platforms
    : typeof platforms === "string"
      ? platforms.split(/[,/|]/)
      : [];
  return list.some((item) => normalizePlatform(item) === wanted);
}

export function campaignTypeLabel(type: string): string {
  if (type === "ugc") return "UGC";
  if (type === "clipping") return "Clipping";
  return type;
}

/**
 * Stored briefs sometimes keep form-builder labels such as "Field Value:"
 * and "TypeSelection: UGC (...)". Cards should show the human sentence only.
 */
export function cleanCampaignCardText(raw: string): string {
  let text = raw.replace(/\r/g, "");
  text = text.replace(/Type\s*Selection\s*:\s*([A-Za-z]+)\s*\([^)]*\)/gi, "$1");
  text = text.replace(/\bField\s*Value\s*:/gi, " ");
  text = text.replace(/\bType\s*Selection\s*:/gi, " ");
  text = text.replace(/\bTypeSelection\s*:/gi, " ");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");
  return text.trim();
}

export function campaignCardExcerpt(campaign: {
  description?: string | null;
  type?: string | null;
  category?: string | null;
}): string {
  const cleaned = cleanCampaignCardText(campaign.description ?? "");
  const stillNoisy = /field\s*value|typeselection|type\s*selection/i.test(cleaned);
  if (cleaned && !stillNoisy) return cleaned;
  const kind = campaignTypeLabel(campaign.type ?? "");
  const category = campaign.category?.trim();
  if (kind && category) return `${kind} campaign. ${category}.`;
  if (kind) return `${kind} campaign.`;
  return category ? category : "";
}

export type PublicCampaign = {
  id: string;
  title: string;
  description: string;
  type: Campaign["type"];
  typeLabel: string;
  category: string;
  status: "active" | "paused" | "completed";
  platforms: SocialPlatform[];
  payModel: Campaign["payModel"];
  cpmCents: number;
  budgetTotalCents: number;
  budgetSpentCents: number;
  remainingCents: number;
  maxPayoutPerSubmissionCents: number;
  minViews: number;
  minPayoutCents: number;
  endDate: string | null;
  countries: string[];
  requirements: string;
  rules: string;
  captionGuide: string;
  hashtags: string[];
  assets: { id: string; label: string; url: string }[];
  requiredChecks: string[];
  poolSettledAt: string | null;
};

/** Drafts and pending campaigns stay private. Fees, brand id, and workspace stay off this object. */
export function toPublicCampaign(campaign: Campaign): PublicCampaign | null {
  if (campaign.status !== "active" && campaign.status !== "paused" && campaign.status !== "completed") {
    return null;
  }
  const platforms = (Array.isArray(campaign.platforms) ? campaign.platforms : [])
    .map((item) => normalizePlatform(item))
    .filter((item): item is SocialPlatform => item !== null);

  return {
    id: campaign.id,
    title: campaign.title,
    description: campaignCardExcerpt(campaign),
    type: campaign.type,
    typeLabel: campaignTypeLabel(campaign.type),
    category: campaign.category,
    status: campaign.status,
    platforms,
    payModel: campaign.payModel === "pool" ? "pool" : "cpm",
    cpmCents: campaign.cpmCents,
    budgetTotalCents: campaign.budgetTotalCents,
    budgetSpentCents: campaign.budgetSpentCents,
    remainingCents: remainingBudgetCents(campaign),
    maxPayoutPerSubmissionCents: campaign.maxPayoutPerSubmissionCents,
    minViews: campaign.minViews ?? 0,
    minPayoutCents: campaign.minPayoutCents ?? 0,
    endDate: campaign.endDate,
    countries: Array.isArray(campaign.countries) ? campaign.countries : [],
    requirements: cleanCampaignCardText(campaign.requirements ?? ""),
    rules: cleanCampaignCardText(campaign.rules ?? ""),
    captionGuide: cleanCampaignCardText(campaign.captionGuide ?? ""),
    hashtags: Array.isArray(campaign.hashtags) ? campaign.hashtags : [],
    assets: (campaign.assets ?? [])
      .filter((asset) => asset && asset.url && asset.label)
      .map((asset) => ({ id: asset.id, label: asset.label, url: asset.url })),
    requiredChecks: Array.isArray(campaign.requiredChecks) ? campaign.requiredChecks : [],
    poolSettledAt: campaign.poolSettledAt ?? null,
  };
}

export function filterPublicCampaignList(
  campaigns: readonly Campaign[],
  filters?: { q?: string; type?: string; platform?: string },
): Campaign[] {
  const q = filters?.q?.trim().toLowerCase() ?? "";
  const type = filters?.type?.trim() ?? "";
  return campaigns
    // Same rule as lib/campaigns/public (PR 56): active, budget left, end date not passed.
    .filter((campaign) => campaignIsDiscoverable(campaign))
    .filter((campaign) => (type ? campaign.type === type : true))
    .filter((campaign) => campaignMatchesPlatform(campaign.platforms, filters?.platform))
    .filter((campaign) => {
      if (!q) return true;
      const haystack = `${campaign.title} ${campaign.category} ${campaignCardExcerpt(campaign)}`.toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
