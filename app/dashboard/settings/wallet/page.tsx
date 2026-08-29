import Link from "next/link";
import { redirect } from "next/navigation";

import { getMyWallet } from "@/app/actions/wallet";
import { PageHeader, Stat } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function SettingsWalletPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const wallet = await getMyWallet();

  return (
    <div>
      <PageHeader title="Wallet" description="Your available and pending balances." />
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Available" value={formatMoney(wallet.availableCents)} />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} />
      </div>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/dashboard/settings/payout" className="text-gold hover:underline">
          Manage payout method →
        </Link>
        <Link href="/dashboard/settings/withdraw" className="text-gold hover:underline">
          Request withdrawal →
        </Link>
      </div>
    </div>
  );
}
