import { formatAppDateTime } from "@/lib/format/time";
import { redirect } from "next/navigation";

import { DepositReviewButtons } from "@/components/forms/deposit-review-buttons";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function AdminDepositsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const store = await readStore();
  const deposits = store.brandDeposits
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = deposits.filter((deposit) => deposit.status === "pending");
  const settled = deposits.filter((deposit) => deposit.status !== "pending");

  return (
    <div className="dash-stack">
      <PageHeader
        title="Deposits"
        description="Confirm a brand EFT before the wallet is credited. Manual EFT only."
      />

      {pending.length === 0 ? (
        <EmptyState
          title="No deposits waiting"
          description="When a business submits an EFT, it shows up here for confirmation."
        />
      ) : (
        <ul className="space-y-2.5">
          {pending.map((deposit) => {
            const brand = store.profiles.find((profile) => profile.id === deposit.brandId);
            return (
              <li key={deposit.id} className="list-row flex-wrap items-start">
                <div className="min-w-0">
                  <p className="font-medium">{formatMoney(deposit.amountCents)}</p>
                  <p className="text-sm text-foreground">
                    {brand?.displayName ?? "Unknown brand"} · <span className="whitespace-nowrap">{brand?.email ?? deposit.brandId}</span>
                  </p>
                  <p className="text-sm text-muted">{deposit.note}</p>
                  <p className="text-xs text-muted-light">
                    {formatAppDateTime(deposit.createdAt)}
                  </p>
                </div>
                <DepositReviewButtons depositId={deposit.id} />
              </li>
            );
          })}
        </ul>
      )}

      {settled.length > 0 ? (
        <section className="space-y-2.5">
          <h2 className="font-display text-xl tracking-tight">History</h2>
          <ul className="space-y-2.5">
            {settled.map((deposit) => {
              const brand = store.profiles.find((profile) => profile.id === deposit.brandId);
              return (
                <li key={deposit.id} className="list-row items-start">
                  <div>
                    <p className="font-medium">{formatMoney(deposit.amountCents)}</p>
                    <p className="text-sm text-muted">
                      {brand?.displayName ?? "Unknown brand"}
                      {deposit.bankReference ? <> · <span className="whitespace-nowrap">{deposit.bankReference}</span></> : ""}
                    </p>
                    <p className="text-sm text-muted">{deposit.note}</p>
                  </div>
                  <Badge tone={deposit.status === "credited" ? "success" : "danger"}>
                    {deposit.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
