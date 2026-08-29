import Link from "next/link";
import { redirect } from "next/navigation";

import { listBrandCampaigns } from "@/app/actions/campaigns";
import { listBrandBookings } from "@/app/actions/bookings";
import { getMyWallet } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";
import { readStore } from "@/lib/db/store";

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

  const active = campaigns.filter((c) => c.status === "active").length;
  const spent = campaigns.reduce((s, c) => s + c.budgetSpentCents, 0);
  const pendingSubs = store.submissions.filter((s) =>
    campaigns.some((c) => c.id === s.campaignId && s.status === "pending"),
  ).length;

  return (
    <div>
      <PageHeader
        title="Brand overview"
        description="Campaign spend, submission queue, and influencer bookings."
        action={
          <Link href="/dashboard/brand/campaigns/new">
            <Button>New campaign</Button>
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active campaigns" value={String(active)} />
        <Stat label="Budget spent" value={formatMoney(spent)} />
        <Stat label="Pending reviews" value={String(pendingSubs)} />
        <Stat label="Wallet" value={formatMoney(wallet.availableCents)} hint="For bookings & deposits" />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl">Recent campaigns</h2>
            <Link href="/dashboard/brand/campaigns" className="text-sm text-muted">
              View all →
            </Link>
          </div>
          <ul className="space-y-3">
            {campaigns.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/brand/campaigns/${c.id}`} className="list-row">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted">
                      {c.status} · {formatMoney(c.budgetSpentCents)} / {formatMoney(c.budgetTotalCents)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs capitalize text-muted">{c.type}</span>
                </Link>
              </li>
            ))}
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted">No campaigns yet.</p>
            ) : null}
          </ul>
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl">Bookings</h2>
            <Link href="/influencers" className="text-sm text-muted">
              Browse influencers →
            </Link>
          </div>
          <ul className="space-y-3">
            {bookings.slice(0, 5).map((b) => (
              <li key={b.id} className="list-row">
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{b.status.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted">{formatMoney(b.amountCents)}</p>
                </div>
              </li>
            ))}
            {bookings.length === 0 ? (
              <p className="text-sm text-muted">No bookings yet.</p>
            ) : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
