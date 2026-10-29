import { readStore } from "@/lib/db/store";
import type { Campaign } from "@/lib/db/types";
import { campaignIsDiscoverable } from "@/lib/rewards/content-rewards";

export function canViewCampaign(
  session: { id: string; roles: readonly string[] } | null,
  campaign: { brandId: string } | null,
): boolean {
  if (!session || !campaign) return false;
  return session.roles.includes("admin") || campaign.brandId === session.id;
}

export function filterDiscoverableCampaigns(
  campaigns: readonly Campaign[],
  filters?: { platform?: string; type?: string; q?: string },
  now = Date.now(),
): Campaign[] {
  return campaigns
    .filter((campaign) => campaignIsDiscoverable(campaign, now))
    .filter((campaign) => (filters?.type ? campaign.type === filters.type : true))
    .filter((campaign) => (filters?.platform ? campaign.platforms.includes(filters.platform as never) : true))
    .filter((campaign) =>
      filters?.q
        ? `${campaign.title} ${campaign.category} ${campaign.description}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listActiveCampaignsPublic(filters?: { platform?: string; type?: string; q?: string }) {
  const store = await readStore();
  return filterDiscoverableCampaigns(store.campaigns, filters);
}

/** Public campaign page. Drafts and pending campaigns stay private. */
export async function getPublicCampaign(id: string) {
  const store = await readStore();
  const campaign = store.campaigns.find((item) => item.id === id) ?? null;
  if (!campaign || campaign.status === "draft" || campaign.status === "pending") return null;
  return campaign;
}
