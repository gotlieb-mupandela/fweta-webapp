import { redirect } from "next/navigation";

import { listMyLinkedAccounts } from "@/app/actions/submissions";
import { LinkedAccountForm } from "@/components/forms/linked-account-form";
import { SocialAccountsManager } from "@/components/onboarding/social-accounts";
import { ContextHelp } from "@/components/onboarding/context-help";
import { Card, PageHeader } from "@/components/ui/card";
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
  const linked = await listMyLinkedAccounts();

  return (
    <div className="dash-stack">
      <PageHeader
        title="Connected accounts"
        description="Connect more than one account on each platform. Add FWETA and your code to the public bio so we know the post is yours."
      />
      <ContextHelp
        title="Each account has its own code"
        body="Paste the code in that account's bio and check it. Stats below each account count the clips you submitted from it."
        hint="A default is only a suggestion. You still choose the account on each submission. This is not a login to TikTok, Instagram, YouTube, or X."
      />
      <SocialAccountsManager initialAccounts={accounts} stats={stats} />
      <Card>
        <h2 className="font-display text-xl tracking-tight">Bio check</h2>
        <p className="mt-1.5 text-sm text-muted">
          Use this when a campaign asks for a one‑time bio code before the first clip.
        </p>
        <div className="mt-4">
          <LinkedAccountForm accounts={linked} />
        </div>
      </Card>
    </div>
  );
}
