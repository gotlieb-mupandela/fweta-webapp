import Link from "next/link";
import { redirect } from "next/navigation";

import { listActiveCampaignsPublic, listDiscoverCategories } from "@/app/actions/campaigns";
import { CampaignCard } from "@/components/rewards/campaign-card";
import { DiscoverFilters } from "@/components/rewards/discover-filters";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

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
        categories={categories}
      />

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
