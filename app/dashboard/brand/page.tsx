import Link from "next/link";
import { redirect } from "next/navigation";

import { listBrandBookings } from "@/app/actions/bookings";
import { listBrandCampaigns } from "@/app/actions/campaigns";
import { getMyWallet } from "@/app/actions/wallet";
import { GuidedEmpty } from "@/components/onboarding/guided-empty";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, SectionHeader, Stat, StatGrid } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { remainingBudgetCents } from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function BrandDashboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [campaigns, bookings, wallet, store] = await Promise.all([
    listBrandCampaigns(),
    listBrandBookings(),
    getMyWallet(),
    readStore(),
  ]);

  const profile = store.profiles.find((item) => item.id === session.id) ?? null;
  const hasPayout = store.payoutMethods.some((method) => method.userId === session.id);
  const ids = new Set(campaigns.map((campaign) => campaign.id));
  const submissions = store.submissions.filter((submission) => ids.has(submission.campaignId));
  const live = campaigns.filter((campaign) => campaign.status === "active" || campaign.status === "paused");
  const budgetLeft = live.reduce((sum, campaign) => sum + remainingBudgetCents(campaign), 0);
  const views = submissions.reduce((sum, submission) => sum + submission.views, 0);
  const spent = campaigns.reduce((sum, campaign) => sum + campaign.budgetSpentCents, 0);
  const netCpm = views > 0 ? Math.round((spent / views) * 1000) : 0;
  const toReview = submissions.filter((submission) => submission.status === "pending").length;
  const reviewCampaign = campaigns.find((campaign) =>
    submissions.some((submission) => submission.campaignId === campaign.id && submission.status === "pending"),
  );

  return (
    <div className="dash-stack">
      <PageHeader
        title="Overview"
        description="Budget still available, views delivered, and clips waiting on you."
        action={
          <Link href="/dashboard/brand/campaigns/new">
            <Button>New campaign</Button>
          </Link>
        }
      />

      <StatGrid>
        <Stat label="Budget left" value={formatMoney(budgetLeft)} hint="Active and paused campaigns" />
        <Stat label="Views" value={formatNumber(views)} hint="Across your campaigns" />
        <Stat
          label="Net CPM"
          value={formatMoney(netCpm)}
          hint={views > 0 ? "Spent per 1,000 views" : "No views recorded yet"}
        />
        <Stat label="Clips to review" value={String(toReview)} />
      </StatGrid>

      <div className="dash-split">
        <section>
          <SectionHeader title="Next actions" />
          <ul className="space-y-2.5">
            {toReview > 0 && reviewCampaign ? (
              <li>
                <Link href={`/dashboard/brand/campaigns/${reviewCampaign.id}/submissions`} className="list-row">
                  <div>
                    <p className="text-sm font-medium">Review {toReview} clip{toReview === 1 ? "" : "s"}</p>
                    <p className="text-xs text-muted">{reviewCampaign.title}</p>
                  </div>
                </Link>
              </li>
            ) : null}
            {wallet.availableCents <= 0 ? (
              <li>
                <Link href="/dashboard/brand/deposits" className="list-row">
                  <div>
                    <p className="text-sm font-medium">Record a pay-in</p>
                    <p className="text-xs text-muted">Wallet is empty. Campaigns cannot go live until it is credited.</p>
                  </div>
                </Link>
              </li>
            ) : null}
            {campaigns.length === 0 ? (
              <li>
                <Link href="/dashboard/brand/campaigns/new" className="list-row">
                  <div>
                    <p className="text-sm font-medium">Create your first campaign</p>
                    <p className="text-xs text-muted">Set a budget and a rate per 1,000 views.</p>
                  </div>
                </Link>
              </li>
            ) : null}
            {toReview === 0 && wallet.availableCents > 0 && campaigns.length > 0 ? (
              <li className="text-sm text-muted">Nothing is waiting. Live campaigns keep paying until the budget ends.</li>
            ) : null}
          </ul>
        </section>

        <section>
          <SectionHeader title="Campaigns" href="/dashboard/brand/campaigns" linkLabel="All campaigns" />
          {campaigns.length === 0 ? (
            <GuidedEmpty
              kind="brand-campaigns"
              profile={profile}
              hasPayout={hasPayout}
              fallback={{
                title: "No campaigns yet",
                description: "Launch a clipping or UGC campaign and creators can submit.",
                href: "/dashboard/brand/campaigns/new",
                cta: "Create campaign",
              }}
            />
          ) : (
            <ul className="space-y-2.5">
              {campaigns.slice(0, 5).map((campaign) => (
                <li key={campaign.id}>
                  <Link href={`/dashboard/brand/campaigns/${campaign.id}`} className="list-row">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{campaign.title}</p>
                      <p className="text-xs text-muted">
                        {formatMoney(remainingBudgetCents(campaign))} left of {formatMoney(campaign.budgetTotalCents)}
                      </p>
                    </div>
                    <Badge tone={campaign.status === "active" ? "success" : "muted"}>{campaign.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {bookings.length > 0 ? (
        <section>
          <SectionHeader title="Bookings" href="/dashboard/brand/bookings" linkLabel="All bookings" />
          <ul className="space-y-2.5">
            {bookings.slice(0, 3).map((booking) => (
              <li key={booking.id} className="list-row">
                <p className="text-sm font-medium capitalize">{booking.status.replace(/_/g, " ")}</p>
                <p className="text-sm text-muted">{formatMoney(booking.amountCents)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
