import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyWallet } from "@/app/actions/wallet";
import { CampaignForm } from "@/components/forms/campaign-form";
import { Card, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function NewCampaignPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const wallet = await getMyWallet();

  return (
    <div>
      <PageHeader title="New campaign" description="Set budget, CPM, and platform rules." />
      <Card className="mb-6 max-w-2xl">
        <p className="text-sm text-muted">
          Wallet balance:{" "}
          <span className="font-medium text-foreground">{formatMoney(wallet.availableCents)}</span>
          {" · "}
          <Link href="/dashboard/brand/deposits" className="text-gold hover:underline">
            Record a deposit
          </Link>
        </p>
        <p className="mt-1 text-xs text-muted">
          Launching an active campaign allocates the full budget from your wallet.
        </p>
      </Card>
      <CampaignForm mode="create" walletAvailableCents={wallet.availableCents} />
    </div>
  );
}
