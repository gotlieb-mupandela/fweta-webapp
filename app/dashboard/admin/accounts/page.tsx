import { redirect } from "next/navigation";

import { AdminAccountActions } from "@/components/onboarding/admin-account-actions";
import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { PLATFORM_LABEL } from "@/lib/onboarding/model";
import { statsByAccount } from "@/lib/onboarding/accounts";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function AdminAccountsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const accounts = [...(store.socialAccounts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const stats = statsByAccount(accounts, store.submissions);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Social accounts"
        description="Every connected account, including ones still waiting on a bio code."
      />
      <ContextHelp
        title="Manage verification"
        body="You can mark an account verified when you have checked it yourself, or remove one that should not stay on the platform."
      />
      {accounts.length === 0 ? (
        <EmptyState title="No social accounts" description="Creator accounts show up here after they connect one." />
      ) : (
        <ul className="space-y-2.5">
          {accounts.map((account) => {
            const user = store.profiles.find((profile) => profile.id === account.userId);
            const stat = stats.find((item) => item.accountId === account.id);
            return (
              <li key={account.id} className="list-row items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {PLATFORM_LABEL[account.platform]} @{account.handle}
                  </p>
                  <p className="text-sm text-muted">{user?.email}</p>
                  <p className="mt-1 text-xs text-muted">
                    {account.code}
                    {account.isDefault ? " · Default" : ""}
                    {stat ? ` · ${stat.submissions} clips · ${formatNumber(stat.views)} views · ${formatMoney(stat.earningsCents)}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={account.status === "verified" ? "success" : "gold"}>
                    {account.status === "verified" ? "Verified" : "Pending"}
                  </Badge>
                  <AdminAccountActions accountId={account.id} verified={account.status === "verified"} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
