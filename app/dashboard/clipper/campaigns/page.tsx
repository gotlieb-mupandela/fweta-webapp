import Link from "next/link";
import { redirect } from "next/navigation";

import { listActiveCampaignsPublic, listDiscoverCategories } from "@/app/actions/campaigns";
import { CampaignCard } from "@/components/rewards/campaign-card";
import { DiscoverFilters } from "@/components/rewards/discover-filters";
import { InfluencerOffers } from "@/components/rewards/influencer-offers";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

function nadToCents(value?: string): number | undefined {
  if (!value) return undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return Math.round(amount * 100);
}

export default async function ClipperCampaignsPage({
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
    minRate?: string;
    minBudget?: string;
  }>;
}) {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const [rows, categories] = await Promise.all([
    listActiveCampaignsPublic({
      q: params.q,
      type: params.type,
      platform: params.platform,
      category: params.category,
      sort: params.sort,
      payModel: params.payModel,
      country: params.country,
      minRateCents: nadToCents(params.minRate),
      minBudgetCents: nadToCents(params.minBudget),
    }),
    listDiscoverCategories(),
  ]);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Discover"
        description="CPM and pool campaigns. The rate on the card is what you receive."
      />
      <DiscoverFilters
        q={params.q}
        type={params.type}
        platform={params.platform}
        category={params.category}
        sort={params.sort}
        payModel={params.payModel}
        country={params.country}
        minRate={params.minRate}
        minBudget={params.minBudget}
        categories={categories}
      />
      <InfluencerOffers />

      {rows.length === 0 ? (
        <EmptyState
          title="No campaigns match"
          description="Try another filter, or check the public marketplace."
          action={
            <Link href="/campaigns" className="section-link">
              Open marketplace
            </Link>
          }
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
  );
}
