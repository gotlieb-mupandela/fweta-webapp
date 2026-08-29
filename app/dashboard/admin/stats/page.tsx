import { redirect } from "next/navigation";

import { getPlatformStats } from "@/app/actions/settings";
import { Card, PageHeader, Stat } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function AdminStatsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [stats, store] = await Promise.all([getPlatformStats(), readStore()]);

  if (!stats) redirect("/dashboard");

  const totalDeposits = store.brandDeposits.reduce((s, d) => s + d.amountCents, 0);
  const totalWithdrawn = store.withdrawalRequests
    .filter((w) => w.status === "paid")
    .reduce((s, w) => s + w.amountCents, 0);

  return (
    <div>
      <PageHeader title="Platform stats" description="High-level marketplace metrics." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={String(stats.users)} />
        <Stat label="Active campaigns" value={String(stats.activeCampaigns)} />
        <Stat label="Submissions" value={String(stats.submissions)} />
        <Stat label="Bookings" value={String(stats.bookings)} />
        <Stat label="GMV (credits)" value={formatMoney(stats.gmvCents)} />
        <Stat label="Brand deposits" value={formatMoney(totalDeposits)} />
        <Stat label="Paid withdrawals" value={formatMoney(totalWithdrawn)} />
        <Stat label="Open fraud flags" value={String(stats.openFraudFlags)} />
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-display text-xl">Campaigns by status</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(["draft", "pending", "active", "paused", "completed"] as const).map((status) => {
              const count = store.campaigns.filter((c) => c.status === status).length;
              return (
                <li key={status} className="flex justify-between">
                  <span className="text-muted">{status}</span>
                  <span>{count}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="font-display text-xl">Withdrawals by status</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(["pending", "processing", "paid", "rejected"] as const).map((status) => {
              const count = store.withdrawalRequests.filter((w) => w.status === status).length;
              return (
                <li key={status} className="flex justify-between">
                  <span className="text-muted">{status}</span>
                  <span>{count}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
