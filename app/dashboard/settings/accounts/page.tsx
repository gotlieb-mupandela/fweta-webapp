import { redirect } from "next/navigation";

import { SocialAccountsManager } from "@/components/onboarding/social-accounts";
import { ContextHelp } from "@/components/onboarding/context-help";
import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { accountsForUser, statsByAccount } from "@/lib/onboarding/accounts";

export default async function SocialAccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await readStore();
  const accounts = accountsForUser(store.socialAccounts, session.id);
  const stats = statsByAccount(
    accounts,
    store.submissions.filter((submission) => submission.clipperId === session.id),
  );

  return (
    <div className="dash-stack">
      <PageHeader
        title="Social accounts"
        description="Connect more than one account on each platform. Set a default, and pick the account when you submit a clip."
      />
      <ContextHelp
        title="Each account has its own code"
        body="Paste the code in that account's bio and check it. Stats below each account count the clips you submitted from it."
        hint="A default is only a suggestion. You still choose the account on each submission."
      />
      <SocialAccountsManager initialAccounts={accounts} stats={stats} />
    </div>
  );
}
