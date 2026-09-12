import Link from "next/link";
import { redirect } from "next/navigation";

import { adminListUsers, getPlatformStats } from "@/app/actions/settings";
import { listPendingWithdrawalsAdmin } from "@/app/actions/wallet";
import { AdminCreditForm } from "@/components/forms/admin-credit-form";
import { PageHeader, SectionHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

const QUICK_LINKS = [
  { href: "/dashboard/admin/withdrawals", label: "Withdrawal queue" },
  { href: "/dashboard/admin/users", label: "User management" },
  { href: "/dashboard/admin/fraud", label: "Fraud review" },
  { href: "/dashboard/admin/stats", label: "Platform stats" },
];

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [stats, withdrawals, users] = await Promise.all([
    getPlatformStats(),
    listPendingWithdrawalsAdmin(),
    adminListUsers(),
  ]);

  const pending = withdrawals.filter((w) => w.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Admin overview"
        description="Withdrawal queue, manual EFT payouts, and platform oversight."
        action={
          <Link href="/dashboard/admin/withdrawals">
            <Button variant="secondary" size="sm">
              Withdrawals ({pending})
            </Button>
          </Link>
        }
      />

      {stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Users" value={String(stats.users)} />
          <Stat label="Active campaigns" value={String(stats.activeCampaigns)} />
          <Stat label="Pending withdrawals" value={String(stats.pendingWithdrawals)} />
          <Stat label="Open fraud flags" value={String(stats.openFraudFlags)} />
        </div>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <AdminCreditForm users={users.map((u) => ({ id: u.id, email: u.email }))} />
        <section>
          <SectionHeader title="Quick links" />
          <ul className="space-y-2">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="list-row">
                  <span className="text-sm font-medium">{l.label}</span>
                  <span className="text-muted-light" aria-hidden>
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {stats ? (
            <p className="mt-6 text-sm text-muted">GMV tracked: {formatMoney(stats.gmvCents)}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
