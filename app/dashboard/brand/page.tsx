import Link from "next/link";
import { redirect } from "next/navigation";

import { listBrandCampaigns } from "@/app/actions/campaigns";
import { listBrandBookings } from "@/app/actions/bookings";
import { getMyWallet } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
  StatGrid,
} from "@/components/ui/card";
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
    <div className="dash-stack">
      <PageHeader
        title="Brand overview"
        description="Campaign spend, submission queue, and influencer bookings."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/brand/deposits">
              <Button variant="secondary">Deposits</Button>
            </Link>
            <Link href="/dashboard/brand/campaigns/new">
              <Button>New campaign</Button>
            </Link>
          </div>
        }
      />

      <StatGrid>
        <Stat label="Active campaigns" value={String(active)} />
        <Stat label="Budget spent" value={formatMoney(spent)} />
        <Stat label="Pending reviews" value={String(pendingSubs)} />
        <Stat label="Wallet" value={formatMoney(wallet.availableCents)} hint="For bookings & deposits" />
      </StatGrid>

      <div className="dash-split">
        <section>
          <SectionHeader title="Recent campaigns" href="/dashboard/brand/campaigns" />
          {campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              description="Launch a clipping or UGC campaign and invite creators to distribute for you."
              action={
                <Link href="/dashboard/brand/campaigns/new">
                  <Button size="sm">Create campaign</Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2.5">
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
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Bookings" href="/influencers" linkLabel="Browse influencers →" />
          {bookings.length === 0 ? (
            <EmptyState
              title="No bookings yet"
              description="Hire influencers at their listed rates for trusted sponsored posts."
              action={
                <Link href="/influencers">
                  <Button size="sm" variant="secondary">
                    Browse influencers
                  </Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {bookings.slice(0, 5).map((b) => (
                <li key={b.id} className="list-row">
                  <div className="min-w-0">
                    <p className="text-sm font-medium capitalize">{b.status.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted">{formatMoney(b.amountCents)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
