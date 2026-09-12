import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getMyPayoutMethodMasked,
  getMyWallet,
  listMyWithdrawals,
} from "@/app/actions/wallet";
import { WithdrawalForm } from "@/components/forms/withdrawal-form";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="dash-stack">
      <PageHeader title="Withdraw" description="Request a manual EFT payout (min N$100)." />

      {!method ? (
        <EmptyState
          title="Add payout method first"
          description="Bank details are required before you can withdraw."
          action={
            <Link href="/dashboard/settings/payout">
              <Button size="sm">Set up payout method</Button>
            </Link>
          }
        />
      ) : (
        <Card className="panel-interactive">
          <p className="text-sm text-muted">
            Available:{" "}
            <span className="font-medium text-foreground">
              {formatMoney(wallet.availableCents)}
            </span>{" "}
            · Payout to {method.bankName}
          </p>
          <div className="mt-4">
            <WithdrawalForm payoutMethodId={method.id} availableCents={wallet.availableCents} />
          </div>
        </Card>
      )}

      <section>
        <SectionHeader title="Withdrawal history" />
        {withdrawals.length === 0 ? (
          <EmptyState
            title="No withdrawals yet"
            description="Requests you submit will appear here."
          />
        ) : (
          <ul className="space-y-2.5">
            {withdrawals.map((w) => (
              <li key={w.id} className="list-row">
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
      </section>
    </div>
  );
}
