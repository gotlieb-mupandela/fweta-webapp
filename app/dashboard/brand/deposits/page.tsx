import { redirect } from "next/navigation";

import { BrandDepositForm } from "@/components/forms/brand-deposit-form";
import { Card, PageHeader } from "@/components/ui/card";
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
    <div>
      <PageHeader
        title="Deposits"
        description="Record manual EFT deposits to fund your wallet (v1)."
      />

      <Card className="mb-10">
        <h2 className="font-display text-xl">Record deposit</h2>
        <p className="mt-1 text-sm text-muted">
          After your EFT clears, record the amount here to credit your wallet.
        </p>
        <div className="mt-6">
          <BrandDepositForm />
        </div>
      </Card>

      <h2 className="mb-4 font-display text-2xl">History</h2>
      {deposits.length === 0 ? (
        <p className="text-sm text-muted">No deposits recorded yet.</p>
      ) : (
        <ul className="space-y-3">
          {deposits.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium">{formatMoney(d.amountCents)}</p>
                <p className="text-sm text-muted">{d.note}</p>
              </div>
              <p className="text-xs text-muted">{new Date(d.createdAt).toLocaleDateString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
