import { redirect } from "next/navigation";

import { BrandDepositForm } from "@/components/forms/brand-deposit-form";
import { Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function BrandDepositsPage() {
  const session = await getSession();
  if (!session?.roles.includes("brand") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const deposits = store.brandDeposits
    .filter((d) => d.brandId === session.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Deposits"
        description="Record manual EFT deposits to fund your wallet (v1)."
      />

      <Card className="panel-interactive">
        <h2 className="font-display text-xl tracking-tight">Record deposit</h2>
        <p className="mt-1.5 text-sm text-muted">
          After your EFT clears, record the amount here to credit your wallet.
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
            description="Record your first EFT deposit to fund campaigns and bookings."
          />
        ) : (
          <ul className="space-y-2.5">
            {deposits.map((d) => (
              <li key={d.id} className="list-row">
                <div>
                  <p className="font-medium">{formatMoney(d.amountCents)}</p>
                  <p className="text-sm text-muted">{d.note}</p>
                </div>
                <p className="text-xs text-muted">{new Date(d.createdAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
