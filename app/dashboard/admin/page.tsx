import { redirect } from "next/navigation";

import { adminListUsers } from "@/app/actions/settings";
import { listPendingWithdrawalsAdmin } from "@/app/actions/wallet";
import { AdminCreditForm } from "@/components/forms/admin-credit-form";
import { PageHeader, SectionHeader, Stat, StatGrid } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { latestConfirmedSnapshot } from "@/lib/rewards/content-rewards";

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const [withdrawals, users, store] = await Promise.all([
    listPendingWithdrawalsAdmin(),
    adminListUsers(),
    readStore(),
  ]);

  const payIns = store.brandDeposits.filter((deposit) => deposit.status === "pending").length;
  const payouts = withdrawals.filter((withdrawal) => withdrawal.status === "pending").length;
  const flags = store.fraudFlags.filter((flag) => flag.status === "open").length;
  const pendingReports = store.viewSnapshots.filter((snap) => snap.status === "pending").length;
  const unchecked = store.submissions.filter((submission) => {
    if (submission.status !== "approved" || submission.payoutState === "clawed_back") return false;
    const campaign = store.campaigns.find((item) => item.id === submission.campaignId);
    if (!campaign || campaign.status !== "active") return false;
    return !latestConfirmedSnapshot(store.viewSnapshots, submission.id);
  }).length;
  const viewChecks = pendingReports + unchecked;

  return (
    <div className="dash-stack">
      <PageHeader
        title="Overview"
        description="What needs a person before money moves. Open a number to work that queue."
      />

      <StatGrid>
        <Stat href="/dashboard/admin/payins" label="Pay-ins to confirm" value={String(payIns)} hint="Brand transfers waiting" />
        <Stat href="/dashboard/admin/views" label="View checks due" value={String(viewChecks)} hint="Reports and clips with no count" />
        <Stat href="/dashboard/admin/withdrawals" label="Payouts due" value={String(payouts)} hint="Creator withdrawals" />
        <Stat href="/dashboard/admin/fraud" label="Flags" value={String(flags)} hint="Open fraud reviews" />
      </StatGrid>

      <section>
        <SectionHeader title="Credit a wallet" />
        <AdminCreditForm users={users.map((user) => ({ id: user.id, email: user.email }))} />
      </section>
    </div>
  );
}
