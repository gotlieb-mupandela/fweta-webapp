import Link from "next/link";

import { listActiveCampaignsPublic, listDiscoverCategories } from "@/app/actions/campaigns";
import { PublicChrome } from "@/components/public-chrome";
import { CampaignCard } from "@/components/rewards/campaign-card";
import { DiscoverFilters } from "@/components/rewards/discover-filters";
import { EmptyState } from "@/components/ui/card";
import { readStore } from "@/lib/db/store";
import { buildPublicCatalog } from "@/lib/rewards/content-rewards";
import { formatNumber } from "@/lib/utils";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    platform?: string;
    category?: string;
    sort?: string;
    payModel?: string;
    country?: string;
  }>;
}) {
  const params = await searchParams;
  const [rows, categories, store] = await Promise.all([
    listActiveCampaignsPublic({
      q: params.q,
      type: params.type,
      platform: params.platform,
      category: params.category,
      sort: params.sort,
      payModel: params.payModel,
      country: params.country,
    }),
    listDiscoverCategories(),
    readStore(),
  ]);
  const catalog = buildPublicCatalog(store, params.country);

  return (
    <PublicChrome
      title="Discover campaigns"
      description="Brands reserve a budget first. You earn the rate on the card, in NAD."
    >
      <DiscoverFilters
        q={params.q}
        type={params.type}
        platform={params.platform}
        category={params.category}
        sort={params.sort}
        payModel={params.payModel}
        country={params.country}
        categories={categories}
      />

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl tracking-tight">Featured</h2>
        {catalog.featured.length === 0 ? (
          <p className="text-sm text-muted">No live campaigns yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {catalog.featured.map((row) => (
              <li key={row.campaign.id}>
                <CampaignCard campaign={row.campaign} approvedClips={row.approvedClips} href={`/campaigns/${row.campaign.id}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-2xl tracking-tight">Top campaigns</h2>
        {catalog.topCampaigns.length === 0 ? (
          <p className="text-sm text-muted">Ranks appear after approved clips have confirmed views.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {catalog.topCampaigns.map((row) => (
              <li key={row.campaign.id}>
                <CampaignCard campaign={row.campaign} approvedClips={row.approvedClips} href={`/campaigns/${row.campaign.id}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-2xl tracking-tight">Top clips</h2>
        {catalog.topClips.length === 0 ? (
          <p className="text-sm text-muted">Confirmed views will rank clips here.</p>
        ) : (
          <ol className="space-y-2">
            {catalog.topClips.map((clip, index) => (
              <li key={clip.submissionId}>
                <Link href={`/campaigns/${clip.campaignId}`} className="list-row">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {index + 1}. {clip.creatorName}
                      {clip.handle ? ` · ${clip.handle}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted">{clip.campaignTitle}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium">{formatNumber(clip.views)} views</p>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <h2 className="mt-10 font-display text-2xl tracking-tight">All campaigns</h2>
      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            title="No campaigns match"
            description="Try another platform, category, or search."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.campaign.id}>
                <CampaignCard
                  campaign={row.campaign}
                  approvedClips={row.approvedClips}
                  href={`/campaigns/${row.campaign.id}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicChrome>
  );
}
