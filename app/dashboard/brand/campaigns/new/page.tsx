import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyWallet } from "@/app/actions/wallet";
import { CampaignForm } from "@/components/forms/campaign-form";
import { Card, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { feeBpsFromStore } from "@/lib/rewards/content-rewards";
import { formatMoney } from "@/lib/utils";

export default async function NewCampaignPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [wallet, store] = await Promise.all([getMyWallet(), readStore()]);
  const feeBps = feeBpsFromStore(store);
  const feeLabel = `${(feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 2)}%`;

  return (
    <div className="dash-stack">
      <PageHeader title="New campaign" description="Set budget, CPM, and platform rules." />
      <Card className="max-w-2xl panel-interactive">
        <p className="text-sm text-muted">
          Wallet balance:{" "}
          <span className="font-medium text-foreground">{formatMoney(wallet.availableCents)}</span>
          {" · "}
          <Link href="/dashboard/brand/deposits" className="font-medium text-gold-deep hover:underline">
            Record a deposit
          </Link>
        </p>
        <p className="mt-1.5 text-xs text-muted">
          Launching reserves the creator budget plus a {feeLabel} fee set-aside. The fee is charged only on views that are paid.
        </p>
      </Card>
      <CampaignForm mode="create" walletAvailableCents={wallet.availableCents} feeBps={feeBps} />
    </div>
  );
}
