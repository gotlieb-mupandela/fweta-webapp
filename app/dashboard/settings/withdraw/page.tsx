import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { getMyWallet, listMyWithdrawals } from "@/app/actions/wallet";
import { KycForm } from "@/components/forms/kyc-form";
import { ContextHelp } from "@/components/onboarding/context-help";
import { WithdrawalForm } from "@/components/forms/withdrawal-form";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { payoutIdentityReady } from "@/lib/marketplace/growth";
import { maskKyc } from "@/lib/settings/kyc-record";
import { maskPayoutRecord, payoutMethodForUser } from "@/lib/settings/payout-record";
import { withdrawGate, withdrawGateMessage } from "@/lib/settings/withdraw-gate";
import { formatMoney } from "@/lib/utils";

export default async function SettingsWithdrawPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === session.id) ?? null;
  const methodRecord = payoutMethodForUser(store.payoutMethods, session.id);
  const method = methodRecord ? maskPayoutRecord(methodRecord) : null;

  const kyc = maskKyc(profile?.kyc);
  const [wallet, withdrawals] = await Promise.all([getMyWallet(), listMyWithdrawals()]);
  const gate = withdrawGate({
    hasPayoutMethod: Boolean(method),
    identityReady: payoutIdentityReady(profile?.kyc ?? null),
    kyc: kyc ? { status: kyc.status, documentOnFile: kyc.documentOnFile } : null,
  });
  const blocked = gate.kind === "ready" ? null : withdrawGateMessage(gate);

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
        <div id="identity">
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
        </div>
      ) : (
        <p id="identity" className="text-sm text-muted">
          Identity on file: {kyc.legalName}, {kyc.country}, ID {kyc.idMasked}.{" "}
          {kyc.status === "verified"
            ? "Verified."
            : "Waiting for a review before the first payout."}
        </p>
      )}

      {blocked ? (
        blocked.href.startsWith("#") ? (
          <Card>
            <h2 className="font-display text-xl tracking-tight">{blocked.title}</h2>
            <p className="mt-1.5 text-sm text-muted">{blocked.body}</p>
            <div className="mt-4">
              <a href={blocked.href}>
                <Button size="sm" variant="secondary">
                  {blocked.action}
                </Button>
              </a>
            </div>
          </Card>
        ) : (
          <EmptyState
            title={blocked.title}
            description={blocked.body}
            action={
              <Link href={blocked.href}>
                <Button size="sm">{blocked.action}</Button>
              </Link>
            }
          />
        )
      ) : method ? (
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
      ) : null}

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
