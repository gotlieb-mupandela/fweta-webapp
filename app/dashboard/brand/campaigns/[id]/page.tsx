import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { CampaignStatusButtons } from "@/components/forms/campaign-status-buttons";
import { Badge, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
    redirect("/dashboard/brand/campaigns");
  }

  return (
    <div>
      <PageHeader
        title={campaign.title}
        description={campaign.description}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/brand/campaigns/${id}/edit`}>
              <Button variant="secondary" size="sm">
                Edit
              </Button>
            </Link>
            <Link href={`/dashboard/brand/campaigns/${id}/submissions`}>
              <Button size="sm">Submissions</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge tone={campaign.status === "active" ? "gold" : "muted"}>{campaign.status}</Badge>
        <Badge>{campaign.type}</Badge>
        <Badge tone="neutral">{campaign.category}</Badge>
      </div>

      <CampaignStatusButtons campaignId={campaign.id} status={campaign.status} />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-muted">Budget</p>
          <p className="mt-1 font-display text-2xl">
            {formatMoney(campaign.budgetSpentCents)} / {formatMoney(campaign.budgetTotalCents)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">CPM</p>
          <p className="mt-1 font-display text-2xl">{formatMoney(campaign.cpmCents)}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Max per video</p>
          <p className="mt-1 font-display text-2xl">
            {formatMoney(campaign.maxPayoutPerSubmissionCents)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted">Platforms</p>
          <p className="mt-1 text-sm">{campaign.platforms.join(", ")}</p>
        </Card>
      </div>

      {campaign.requirements ? (
        <Card className="mt-6">
          <h2 className="font-display text-xl">Requirements</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{campaign.requirements}</p>
        </Card>
      ) : null}
    </div>
  );
}
