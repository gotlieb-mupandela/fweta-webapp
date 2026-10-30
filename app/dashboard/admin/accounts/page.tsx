import { redirect } from "next/navigation";

import { AccountReviewActions, AdminAccountActions } from "@/components/onboarding/admin-account-actions";
import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { bioHintLabel, statsByAccount } from "@/lib/onboarding/accounts";
import { PLATFORM_LABEL, publicProfileUrl } from "@/lib/onboarding/model";
import { formatMoney, formatNumber } from "@/lib/utils";

export default async function AdminAccountsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const accounts = [...(store.socialAccounts ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const queue = accounts.filter((account) => account.status === "review");
  const rest = accounts.filter((account) => account.status !== "review");
  const stats = statsByAccount(accounts, store.submissions);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Account verification"
        description="Open the profile, confirm the code is in the bio, then approve or reject."
      />
      <ContextHelp
        title="Confirm the code yourself"
        body="A creator lands here after they tap I've added it. A public page read is only a hint. Approve only when you can see the code on the profile. Reject with a short reason if it is missing."
      />
      <section>
        <SectionHeader title="Waiting for review" />
        {queue.length === 0 ? (
          <EmptyState
            title="No accounts are waiting"
            description="Creators show up here after they add the code and tap I've added it."
          />
        ) : (
          <ul className="space-y-2.5">
            {queue.map((account) => {
              const user = store.profiles.find((profile) => profile.id === account.userId);
              const url = publicProfileUrl(account.platform, account.handle);
              return (
                <li key={account.id} className="list-row items-start">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {PLATFORM_LABEL[account.platform]} @{account.handle}
                    </p>
                    <p className="text-[13px] text-muted">{user?.email}</p>
                    <p className="mt-1 font-mono text-sm tracking-wide">{account.code}</p>
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-sm font-medium text-gold-deep hover:underline"
                      >
                        Open profile
                      </a>
                    ) : null}
                    <p className="mt-2 text-xs text-muted">{bioHintLabel(account.bioHint)}</p>
                  </div>
                  <AccountReviewActions accountId={account.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {rest.length === 0 ? null : (
        <section>
          <SectionHeader title="Other accounts" />
        <ul className="space-y-2.5">
          {rest.map((account) => {
            const user = store.profiles.find((profile) => profile.id === account.userId);
            const stat = stats.find((item) => item.accountId === account.id);
            return (
              <li key={account.id} className="list-row items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {PLATFORM_LABEL[account.platform]} @{account.handle}
                  </p>
                  <p className="text-[13px] text-muted">{user?.email}</p>
                  <p className="mt-1 text-xs text-muted">
                    {account.code}
                    {account.isDefault ? " · Default" : ""}
                    {stat ? ` · ${stat.submissions} clips · ${formatNumber(stat.views)} views · ${formatMoney(stat.earningsCents)}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={account.status === "verified" ? "success" : account.status === "rejected" ? "danger" : "gold"}>
                    {account.status === "verified"
                      ? "Verified"
                      : account.status === "rejected"
                        ? "Rejected"
                        : "Pending verification"}
                  </Badge>
                  <AdminAccountActions accountId={account.id} />
                </div>
              </li>
            );
          })}
        </ul>
        </section>
      )}
    </div>
  );
}
