import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCampaign } from "@/app/actions/campaigns";
import { CampaignStatusButtons } from "@/components/forms/campaign-status-buttons";
import { BudgetBar } from "@/components/rewards/budget-bar";
import { Leaderboard } from "@/components/rewards/leaderboard";
import { Badge, Card, PageHeader, Stat, StatGrid } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import {
  PLATFORM_LABEL,
  campaignIsDiscoverable,
  campaignLeaderboard,
  readyForReview,
  remainingBudgetCents,
} from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

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

  const store = await readStore();
  const submissions = store.submissions.filter((s) => s.campaignId === campaign.id);
  const pendingReady = submissions.filter((s) => readyForReview(s, campaign)).length;
  const views = submissions.reduce((sum, s) => sum + s.views, 0);

  return (
    <div className="dash-stack">
      <PageHeader
        title={campaign.title}
        description={campaign.description}
        action={
          <div className="flex flex-wrap gap-2">
            {campaignIsDiscoverable(campaign) ? (
              <Link href={`/campaigns/${id}`}>
                <Button variant="secondary" size="sm">
                  Public page
                </Button>
              </Link>
            ) : null}
            <Link href={`/dashboard/brand/campaigns/${id}/edit`}>
              <Button variant="secondary" size="sm">
                Edit
              </Button>
            </Link>
            <Link href={`/dashboard/brand/campaigns/${id}/submissions`}>
              <Button size="sm">
                Review{pendingReady > 0 ? ` (${pendingReady})` : ""}
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={campaign.status === "active" ? "gold" : "muted"}>{campaign.status}</Badge>
        <Badge>{campaign.type === "clipping" ? "Clipping" : "UGC"}</Badge>
        <Badge tone="neutral">{campaign.category}</Badge>
      </div>

      <CampaignStatusButtons campaignId={campaign.id} status={campaign.status} />

      <Card>
        <BudgetBar campaign={campaign} />
        <p className="mt-2 text-xs text-muted">
          {formatMoney(remainingBudgetCents(campaign))} still available for verified views.
        </p>
      </Card>

      <StatGrid>
        <Stat label="Per 1,000 views" value={formatMoney(campaign.cpmCents)} />
        <Stat label="Max per post" value={formatMoney(campaign.maxPayoutPerSubmissionCents)} />
        <Stat
          label="Minimum to review"
          value={campaign.minPayoutCents > 0 ? formatMoney(campaign.minPayoutCents) : "None"}
        />
        <Stat label="View floor" value={String(campaign.minViews)} />
        <Stat label={campaign.payModel === "pool" ? "Pot" : "Clipper rate"} value={campaign.payModel === "pool" ? formatMoney(campaign.budgetTotalCents) : formatMoney(campaign.cpmCents)} />
        <Stat label="Verified views" value={formatNumber(views)} />
      </StatGrid>

      <Card>
        <h2 className="font-display text-xl tracking-tight">Platforms</h2>
        <p className="mt-2 text-sm">
          {campaign.platforms.map((platform) => PLATFORM_LABEL[platform]).join(" · ")}
        </p>
        <p className="mt-2 text-xs text-muted">
          {campaign.startDate ? `Starts ${campaign.startDate.slice(0, 10)}. ` : ""}
          {campaign.endDate ? `Ends ${campaign.endDate.slice(0, 10)}.` : "No end date."}
        </p>
      </Card>

      {campaign.requirements ? (
        <Card>
          <h2 className="font-display text-xl tracking-tight">Brief</h2>
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {campaign.requirements}
          </p>
        </Card>
      ) : null}

      {campaign.rules ? (
        <Card>
          <h2 className="font-display text-xl tracking-tight">Rules</h2>
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-muted">{campaign.rules}</p>
        </Card>
      ) : null}

      {campaign.assets.length > 0 ? (
        <Card>
          <h2 className="font-display text-xl tracking-tight">References</h2>
          <ul className="mt-3 space-y-2">
            {campaign.assets.map((asset) => (
              <li key={asset.id}>
                <a href={asset.url} className="text-sm text-gold-deep hover:underline" target="_blank" rel="noreferrer">
                  {asset.label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section>
        <h2 className="mb-3 font-display text-2xl tracking-tight">Leaderboard</h2>
        <Leaderboard rows={campaignLeaderboard(store, campaign.id)} />
      </section>
    </div>
  );
}
