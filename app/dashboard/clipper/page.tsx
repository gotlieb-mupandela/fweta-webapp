import Link from "next/link";
import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { getMyWallet } from "@/app/actions/wallet";
import { Card, PageHeader, SectionHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function ClipperDashboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [submissions, wallet, store] = await Promise.all([
    listClipperSubmissions(),
    getMyWallet(),
    readStore(),
  ]);

  const activeCampaigns = store.campaigns.filter((c) => c.status === "active").length;
  const totalViews = submissions.reduce((s, sub) => s + sub.views, 0);
  const totalEarnings = submissions.reduce((s, sub) => s + sub.earningsCents, 0);
  const pending = submissions.filter((s) => s.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Clipper overview"
        description="Track submissions, views, and wallet balance."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/settings/withdraw">
              <Button variant="secondary">Withdraw</Button>
            </Link>
            <Link href="/dashboard/clipper/campaigns">
              <Button>Browse campaigns</Button>
            </Link>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active campaigns" value={String(activeCampaigns)} />
        <Stat label="My submissions" value={String(submissions.length)} />
        <Stat label="Total views" value={formatNumber(totalViews)} />
        <Stat label="Wallet" value={formatMoney(wallet.availableCents)} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <SectionHeader title="Recent submissions" href="/dashboard/clipper/submissions" />
          <ul className="space-y-3">
            {submissions.slice(0, 5).map((s) => {
              const campaign = store.campaigns.find((c) => c.id === s.campaignId);
              return (
                <li key={s.id} className="list-row">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{campaign?.title ?? "Campaign"}</p>
                    <p className="text-xs text-muted">
                      {s.status} · {formatNumber(s.views)} views · {formatMoney(s.earningsCents)}
                    </p>
                  </div>
                </li>
              );
            })}
            {submissions.length === 0 ? (
              <p className="text-sm text-muted">
                No submissions yet.{" "}
                <Link href="/dashboard/clipper/campaigns" className="section-link text-gold-deep">
                  Browse campaigns
                </Link>
              </p>
            ) : null}
          </ul>
        </section>
        <section>
          <SectionHeader title="Earnings" href="/dashboard/clipper/earnings" linkLabel="View ledger →" />
          <Card>
            <p className="font-display text-4xl tracking-tight">{formatMoney(totalEarnings)}</p>
            <p className="mt-2 text-sm text-muted">{pending} pending review</p>
          </Card>
        </section>
      </div>
    </div>
  );
}
