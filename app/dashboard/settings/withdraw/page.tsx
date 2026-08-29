import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getMyPayoutMethodMasked,
  getMyWallet,
  listMyWithdrawals,
} from "@/app/actions/wallet";
import { WithdrawalForm } from "@/components/forms/withdrawal-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function SettingsWithdrawPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [wallet, method, withdrawals] = await Promise.all([
    getMyWallet(),
    getMyPayoutMethodMasked(),
    listMyWithdrawals(),
  ]);

  return (
    <div>
      <PageHeader title="Withdraw" description="Request a manual EFT payout (min N$100)." />

      {!method ? (
        <EmptyState
          title="Add payout method first"
          description="Bank details are required before you can withdraw."
          action={
            <Link href="/dashboard/settings/payout" className="text-sm text-gold hover:underline">
              Set up payout method →
            </Link>
          }
        />
      ) : (
        <Card className="mb-10">
          <p className="text-sm text-muted">
            Available: {formatMoney(wallet.availableCents)} · Payout to {method.bankName}
          </p>
          <div className="mt-4">
            <WithdrawalForm payoutMethodId={method.id} availableCents={wallet.availableCents} />
          </div>
        </Card>
      )}

      <h2 className="mb-4 font-display text-2xl">Withdrawal history</h2>
      {withdrawals.length === 0 ? (
        <p className="text-sm text-muted">No withdrawals yet.</p>
      ) : (
        <ul className="space-y-3">
          {withdrawals.map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium">{formatMoney(w.amountCents)}</p>
                <p className="text-xs text-muted">{new Date(w.createdAt).toLocaleString()}</p>
              </div>
              <Badge
                tone={
                  w.status === "paid" ? "success" : w.status === "rejected" ? "danger" : "gold"
                }
              >
                {w.status}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
