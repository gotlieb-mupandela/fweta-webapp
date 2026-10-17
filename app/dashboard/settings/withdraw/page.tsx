import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getMyKyc,
  getMyPayoutMethodMasked,
  getMyWallet,
  listMyWithdrawals,
} from "@/app/actions/wallet";
import { KycForm } from "@/components/forms/kyc-form";
import { ContextHelp } from "@/components/onboarding/context-help";
import { WithdrawalForm } from "@/components/forms/withdrawal-form";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function SettingsWithdrawPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [wallet, method, withdrawals, kyc] = await Promise.all([
    getMyWallet(),
    getMyPayoutMethodMasked(),
    listMyWithdrawals(),
    getMyKyc(),
  ]);

  return (
    <div className="dash-stack">
      <PageHeader
        title="Withdraw"
        description="Namibian EFT only, from N$100. An admin sends the transfer and marks it paid."
      />
      <ContextHelp
        title="Payouts are sent by hand"
        body="Request a withdrawal from the available balance. An admin pays it by EFT to the bank details you saved and then marks it paid."
        hint="The minimum withdrawal is N$100. Bank details stay masked after you save them."
      />

      {!kyc || kyc.status === "rejected" || !kyc.documentOnFile ? (
        <Card>
          <h2 className="font-display text-xl tracking-tight">Identity for the first payout</h2>
          <p className="mt-1.5 text-sm text-muted">
            This is collected when you withdraw, not when you sign up. Upload an ID photo. An admin verifies it before the first EFT. The minimum is N$100.
          </p>
          {kyc?.status === "rejected" && kyc.reviewNote ? (
            <p className="mt-2 text-sm text-foreground">Needs another photo: {kyc.reviewNote}</p>
          ) : null}
          <div className="mt-4">
            <KycForm />
          </div>
        </Card>
      ) : (
        <p className="text-sm text-muted">
          Identity on file: {kyc.legalName}, {kyc.country}, ID {kyc.idMasked}.{" "}
          {kyc.status === "verified"
            ? "Verified."
            : "Waiting for a review before the first payout."}
        </p>
      )}

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
      ) : kyc?.status !== "verified" ? (
        <Card>
          <p className="text-sm text-muted">Payout stays closed until an admin verifies the ID photo. Minimum N$100 after that.</p>
        </Card>
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
