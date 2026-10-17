import { redirect } from "next/navigation";

import { listMyLinkedAccounts } from "@/app/actions/submissions";
import { LinkedAccountForm } from "@/components/forms/linked-account-form";
import { Card, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

export default async function LinkedAccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const accounts = await listMyLinkedAccounts();

  return (
    <div className="dash-stack">
      <PageHeader
        title="Connected accounts"
        description="Add FWETA and your code to the public bio so we know the post is yours. This is not a login to TikTok, Instagram, YouTube, or X."
      />
      <Card>
        <LinkedAccountForm accounts={accounts} />
      </Card>
    </div>
  );
}
