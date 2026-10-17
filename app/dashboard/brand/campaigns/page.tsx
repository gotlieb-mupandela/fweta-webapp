import Link from "next/link";
import { redirect } from "next/navigation";

import { listBrandCampaigns } from "@/app/actions/campaigns";
import { BudgetBar } from "@/components/rewards/budget-bar";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function BrandCampaignsPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const campaigns = await listBrandCampaigns();

  return (
    <div className="dash-stack">
      <PageHeader
        title="Campaigns"
        description="Fund a budget and a rate per 1,000 views."
        action={
          <Link href="/dashboard/brand/campaigns/new">
            <Button>New campaign</Button>
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description="Create a clipping or UGC campaign, then fund it from your wallet."
          action={
            <Link href="/dashboard/brand/campaigns/new">
              <Button size="sm">Create campaign</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Link href={`/dashboard/brand/campaigns/${campaign.id}`} className="list-row items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{campaign.title}</p>
                    <Badge tone={campaign.status === "active" ? "gold" : "muted"}>{campaign.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {campaign.type === "clipping" ? "Clipping" : "UGC"} · {campaign.category} ·{" "}
                    {formatMoney(campaign.cpmCents)} / 1k
                  </p>
                  <BudgetBar campaign={campaign} className="mt-3" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
