import Link from "next/link";
import { redirect } from "next/navigation";

import { listBrandCampaigns } from "@/app/actions/campaigns";
import { Card, EmptyState, PageHeader, SectionHeader, Stat, StatGrid } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { qualifiedViewCount } from "@/lib/rewards/content-rewards";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function BrandAnalyticsPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [campaigns, store] = await Promise.all([listBrandCampaigns(), readStore()]);

  const campaignIds = new Set(campaigns.map((c) => c.id));
  const totalBudget = campaigns.reduce((s, c) => s + c.budgetTotalCents, 0);
  const totalSpent = campaigns.reduce((s, c) => s + c.budgetSpentCents, 0);
  const bookingSpend = store.bookings
    .filter((b) => b.brandId === session.id && b.status === "approved")
    .reduce((s, b) => s + b.amountCents, 0);
  const submissionEarnings = store.submissions
    .filter((s) => campaignIds.has(s.campaignId))
    .reduce((s, sub) => s + sub.earningsCents, 0);
  const deposits = store.brandDeposits
    .filter((d) => d.brandId === session.id)
    .reduce((s, d) => s + d.amountCents, 0);
  const brandSubs = store.submissions.filter((item) => campaignIds.has(item.campaignId) && item.status === "approved");
  const totalViews = brandSubs.reduce((sum, item) => sum + qualifiedViewCount(item), 0);
  const costPerThousand = totalViews > 0 ? Math.round((totalSpent * 1000) / totalViews) : 0;
  const topClips = [...brandSubs].sort((a, b) => qualifiedViewCount(b) - qualifiedViewCount(a)).slice(0, 5);
  const creatorTotals = new Map<string, { views: number; earnings: number }>();
  for (const item of brandSubs) {
    const current = creatorTotals.get(item.clipperId) ?? { views: 0, earnings: 0 };
    current.views += qualifiedViewCount(item);
    current.earnings += item.earningsCents;
    creatorTotals.set(item.clipperId, current);
  }
  const topCreators = [...creatorTotals.entries()]
    .sort((a, b) => b[1].views - a[1].views)
    .slice(0, 5);
  const byDay = new Map<string, number>();
  for (const snap of store.viewSnapshots) {
    if (snap.status !== "confirmed") continue;
    const submission = store.submissions.find((item) => item.id === snap.submissionId);
    if (!submission || !campaignIds.has(submission.campaignId)) continue;
    const day = snap.recordedAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + snap.views);
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const peak = days.reduce((max, [, views]) => Math.max(max, views), 0);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Analytics"
        description="Views, cost per 1,000, and the clips that earned."
        action={
          <Link href="/api/brand/analytics" className="section-link">
            Download CSV
          </Link>
        }
      />

      <StatGrid>
        <Stat label="Verified views" value={formatNumber(totalViews)} />
        <Stat label="Cost / 1,000" value={totalViews > 0 ? formatMoney(costPerThousand) : "n/a"} />
        <Stat label="Campaign spend" value={formatMoney(totalSpent)} />
        <Stat label="Deposits" value={formatMoney(deposits)} />
      </StatGrid>

      <section>
        <SectionHeader title="Views checked" />
        {days.length === 0 ? (
          <EmptyState title="No view checks yet" description="Confirmed counts show up here by day." />
        ) : (
          <ul className="space-y-2">
            {days.map(([day, views]) => (
              <li key={day} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm">
                <span className="text-muted">{day}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-gold"
                    style={{ width: `${peak > 0 ? Math.max(4, Math.round((views / peak) * 100)) : 0}%` }}
                  />
                </span>
                <span className="text-right">{formatNumber(views)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHeader title="Top clips" />
          {topClips.length === 0 ? (
            <EmptyState title="No approved clips" description="Approved clips with views rank here." />
          ) : (
            <ul className="space-y-2">
              {topClips.map((item) => (
                <li key={item.id} className="list-row">
                  <p className="min-w-0 truncate text-sm">{item.postUrl}</p>
                  <p className="shrink-0 text-sm">{formatNumber(qualifiedViewCount(item))}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <SectionHeader title="Top creators" />
          {topCreators.length === 0 ? (
            <EmptyState title="No creators yet" description="Creators appear after a clip is approved." />
          ) : (
            <ul className="space-y-2">
              {topCreators.map(([id, row]) => {
                const person = store.profiles.find((item) => item.id === id);
                return (
                  <li key={id} className="list-row">
                    <div>
                      <p className="text-sm font-medium">{person?.displayName || "Creator"}</p>
                      <p className="text-xs text-muted">{formatMoney(row.earnings)} earned</p>
                    </div>
                    <p className="text-sm">{formatNumber(row.views)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <p className="text-sm text-muted">
        Budget {formatMoney(totalBudget)}. Booking spend {formatMoney(bookingSpend)}.
      </p>

      <section>
        <SectionHeader title="By campaign" />
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet" description="Create a campaign to see spend analytics." />
        ) : (
          <ul className="space-y-2.5">
            {campaigns.map((c) => {
              const pct = c.budgetTotalCents
                ? Math.round((c.budgetSpentCents / c.budgetTotalCents) * 100)
                : 0;
              return (
                <li key={c.id}>
                  <Card className="panel-interactive">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate font-medium">{c.title}</p>
                      <p className="shrink-0 text-sm text-muted">{pct}% used</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="mt-2.5 text-sm text-muted">
                      {formatMoney(c.budgetSpentCents)} of {formatMoney(c.budgetTotalCents)}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card className="panel-interactive">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          Submission earnings paid
        </p>
        <p className="mt-3 font-display text-3xl tracking-tight md:text-4xl">
          {formatMoney(submissionEarnings)}
        </p>
        <p className="mt-2 text-sm text-muted">Total credited to clippers from your campaigns.</p>
      </Card>
    </div>
  );
}
