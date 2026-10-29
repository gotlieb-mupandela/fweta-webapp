import { redirect } from "next/navigation";

import { getMyWallet } from "@/app/actions/wallet";
import { BrandDepositForm } from "@/components/forms/brand-deposit-form";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { FWETA_EFT_INSTRUCTIONS, depositReferenceFor } from "@/lib/payments/eft-instructions";
import { formatMoney } from "@/lib/utils";

export default async function BrandDepositsPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [store, wallet] = await Promise.all([readStore(), getMyWallet()]);
  const reference = depositReferenceFor(session.id);
  const deposits = store.brandDeposits
    .filter((d) => d.brandId === session.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Deposits"
        description="Submit the EFT you sent. An admin confirms it, then your wallet is credited."
      />

      <Card className="panel-interactive">
        <h2 className="font-display text-xl tracking-tight">Where to send the EFT</h2>
        <p className="mt-1.5 text-sm text-muted">{FWETA_EFT_INSTRUCTIONS.warning}</p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Bank</dt>
            <dd>{FWETA_EFT_INSTRUCTIONS.bankName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Account name</dt>
            <dd>{FWETA_EFT_INSTRUCTIONS.accountName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Account number</dt>
            <dd className="font-mono">{FWETA_EFT_INSTRUCTIONS.accountNumber}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Branch code</dt>
            <dd className="font-mono">{FWETA_EFT_INSTRUCTIONS.branchCode}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">Your reference</dt>
            <dd className="font-mono">{reference}</dd>
          </div>
        </dl>
      </Card>

      <Card className="panel-interactive">
        <h2 className="font-display text-xl tracking-tight">Submit an EFT</h2>
        <p className="mt-1.5 text-sm text-muted">
          Available now: {formatMoney(wallet.availableCents)}. The wallet does not change until an
          admin confirms the transfer. Manual EFT only.
        </p>
        <div className="mt-5">
          <BrandDepositForm />
        </div>
      </Card>

      <section>
        <SectionHeader title="History" />
        {deposits.length === 0 ? (
          <EmptyState
            title="No deposits yet"
            description="Submit your first EFT. It stays pending until an admin confirms it."
          />
        ) : (
          <ul className="space-y-2.5">
            {deposits.map((d) => (
              <li key={d.id} className="list-row items-start">
                <div>
                  <p className="font-medium">{formatMoney(d.amountCents)}</p>
                  <p className="text-sm text-muted">{d.note}</p>
                  {d.bankReference ? (
                    <p className="text-xs text-muted">Reference {d.bankReference}</p>
                  ) : null}
                  <p className="text-xs text-muted-light">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone={d.status === "credited" ? "success" : d.status === "rejected" ? "danger" : "muted"}>
                  {d.status === "pending" ? "Waiting for confirmation" : d.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
