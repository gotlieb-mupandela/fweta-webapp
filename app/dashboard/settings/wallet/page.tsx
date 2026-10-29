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
  const creatorPayout = session.primaryRole === "clipper" || session.primaryRole === "influencer";

  return (
    <div className="dash-stack">
      <PageHeader
        title="Wallet"
        description={
          creatorPayout
            ? "Available can be withdrawn by Namibian EFT. Pending is money set aside until a hold ends. Bank payouts are marked paid by an admin."
            : "Available balance pays for campaigns and bookings. Pending is money set aside until a hold ends."
        }
      />

      <StatGrid>
        <Stat label="Available" value={formatMoney(wallet.availableCents)} />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} />
      </StatGrid>

      <div className="flex flex-wrap gap-2">
        {creatorPayout ? (
          <>
            <Link href="/dashboard/settings/payout">
              <Button size="sm" variant="secondary">
                Manage payout method
              </Button>
            </Link>
            <Link href="/dashboard/settings/withdraw">
              <Button size="sm">Request a payout</Button>
            </Link>
          </>
        ) : (
          <Link href="/dashboard/brand/deposits">
            <Button size="sm">Record a deposit</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
