import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { CampaignStatusButtons } from "@/components/forms/campaign-status-buttons";
import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, Card, PageHeader, Stat, StatGrid } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { canEditCampaign, canViewCampaign } from "@/lib/onboarding/access";
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
  const store = await readStore();
  if (!canViewCampaign(store, session, campaign)) {
    redirect("/dashboard/brand/campaigns");
  }
  const canEdit = canEditCampaign(store, session, campaign);

  return (
    <div className="dash-stack">
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

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={campaign.status === "active" ? "gold" : "muted"}>{campaign.status}</Badge>
        <Badge>{campaign.type}</Badge>
        <Badge tone="neutral">{campaign.category}</Badge>
      </div>

      {campaign.status === "draft" ? (
        <ContextHelp
          title="Going live spends the wallet"
          body="Activate this draft once an admin has confirmed your transfer and the wallet covers the budget. Creators can submit as soon as it is live."
          hint="Pause stops new submissions. Mark completed when the campaign should close."
        />
      ) : (
        <ContextHelp
          title="Review clips as they arrive"
          body="Open submissions to approve or reject the first clips. Approved clips earn after an admin records views."
        />
      )}

      {canEdit ? <CampaignStatusButtons campaignId={campaign.id} status={campaign.status} /> : (
        <p className="text-sm text-muted">You can view this brand. Managers and the owner can change the campaign.</p>
      )}

      <StatGrid>
        <Stat
          label="Budget"
          value={`${formatMoney(campaign.budgetSpentCents)} / ${formatMoney(campaign.budgetTotalCents)}`}
        />
        <Stat label="CPM" value={formatMoney(campaign.cpmCents)} />
        <Stat label="Max per video" value={formatMoney(campaign.maxPayoutPerSubmissionCents)} />
        <Stat label="Platforms" value={campaign.platforms.join(", ")} />
      </StatGrid>

      {campaign.requirements ? (
        <Card className="panel-interactive">
          <h2 className="font-display text-xl tracking-tight">Requirements</h2>
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {campaign.requirements}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
