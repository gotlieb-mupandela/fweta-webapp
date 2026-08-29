import { redirect } from "next/navigation";

import { listBrandCampaigns } from "@/app/actions/campaigns";
import { Card, PageHeader, Stat } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

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

  return (
    <div>
      <PageHeader title="Analytics" description="Spend breakdown across campaigns and bookings." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total budget" value={formatMoney(totalBudget)} />
        <Stat label="Campaign spend" value={formatMoney(totalSpent)} />
        <Stat label="Booking spend" value={formatMoney(bookingSpend)} />
        <Stat label="Deposits" value={formatMoney(deposits)} />
      </div>

      <div className="mt-10 space-y-4">
        <h2 className="font-display text-2xl">By campaign</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted">No campaigns yet.</p>
        ) : (
          <ul className="space-y-3">
            {campaigns.map((c) => {
              const pct = c.budgetTotalCents
                ? Math.round((c.budgetSpentCents / c.budgetTotalCents) * 100)
                : 0;
              return (
                <li key={c.id}>
                  <Card>
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{c.title}</p>
                      <p className="text-sm text-muted">{pct}% used</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-gold"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {formatMoney(c.budgetSpentCents)} of {formatMoney(c.budgetTotalCents)}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-10">
        <h2 className="font-display text-2xl">Submission earnings paid</h2>
        <p className="mt-2 font-display text-3xl">{formatMoney(submissionEarnings)}</p>
        <p className="text-sm text-muted">Total credited to clippers from your campaigns.</p>
      </div>
    </div>
  );
}
