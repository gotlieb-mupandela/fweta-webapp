import Link from "next/link";
import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { getMyWallet } from "@/app/actions/wallet";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionHeader,
  Stat,
  StatGrid,
} from "@/components/ui/card";
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
    <div className="dash-stack">
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

      <StatGrid>
        <Stat label="Active campaigns" value={String(activeCampaigns)} />
        <Stat label="My submissions" value={String(submissions.length)} />
        <Stat label="Total views" value={formatNumber(totalViews)} />
        <Stat label="Wallet" value={formatMoney(wallet.availableCents)} />
      </StatGrid>

      <div className="dash-split">
        <section>
          <SectionHeader title="Recent submissions" href="/dashboard/clipper/submissions" />
          {submissions.length === 0 ? (
            <EmptyState
              title="No clips yet"
              description="Browse open campaigns, post your cut, and submit the link to start earning."
              action={
                <Link href="/dashboard/clipper/campaigns">
                  <Button size="sm">Browse campaigns</Button>
                </Link>
              }
            />
          ) : (
            <ul className="space-y-2.5">
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
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Earnings" href="/dashboard/clipper/earnings" linkLabel="View ledger →" />
          <Card className="panel-interactive bg-gradient-to-b from-white to-[#fcfbf8]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Lifetime earned
            </p>
            <p className="mt-3 font-display text-4xl tracking-tight md:text-[2.75rem]">
              {formatMoney(totalEarnings)}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-border/80 pt-4 text-sm">
              <span className="text-muted">{pending} pending review</span>
              <Link href="/dashboard/settings/wallet" className="section-link text-gold-deep">
                Wallet →
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
