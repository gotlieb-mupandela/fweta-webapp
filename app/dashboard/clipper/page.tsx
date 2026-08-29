import Link from "next/link";
import { redirect } from "next/navigation";

import { listClipperSubmissions } from "@/app/actions/submissions";
import { getMyWallet } from "@/app/actions/wallet";
import { PageHeader, Stat } from "@/components/ui/card";
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl">Recent submissions</h2>
            <Link href="/dashboard/clipper/submissions" className="text-sm text-muted">
              View all →
            </Link>
          </div>
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
              <p className="text-sm text-muted">No submissions yet.</p>
            ) : null}
          </ul>
        </section>
        <section>
          <h2 className="mb-4 font-display text-2xl">Earnings</h2>
          <p className="font-display text-4xl">{formatMoney(totalEarnings)}</p>
          <p className="mt-1 text-sm text-muted">{pending} pending review</p>
          <Link href="/dashboard/clipper/earnings" className="mt-4 inline-block text-sm text-muted">
            View ledger →
          </Link>
        </section>
      </div>
    </div>
  );
}
