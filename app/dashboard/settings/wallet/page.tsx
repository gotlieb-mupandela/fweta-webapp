import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyWallet } from "@/app/actions/wallet";
import { PageHeader, Stat, StatGrid } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function SettingsWalletPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getMyWallet();

  return (
    <div className="dash-stack">
      <PageHeader title="Wallet" description="Your available and pending balances." />

      <StatGrid>
        <Stat label="Available" value={formatMoney(wallet.availableCents)} />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} />
      </StatGrid>

      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/settings/payout">
          <Button size="sm" variant="secondary">
            Manage payout method
          </Button>
        </Link>
        <Link href="/dashboard/settings/withdraw">
          <Button size="sm">Request withdrawal</Button>
        </Link>
      </div>
    </div>
  );
}
