import { redirect } from "next/navigation";

import { ConfirmPayInButton } from "@/components/onboarding/payin-form";
import { ContextHelp } from "@/components/onboarding/context-help";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";
import { payInRowView } from "@/lib/wallet/brand-deposit";

export default async function AdminPayinsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");

  const store = await readStore();
  const deposits = [...store.brandDeposits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Pay-ins"
        description="Confirm a brand transfer before the wallet is credited."
      />
      <ContextHelp
        title="Manual confirmation"
        body="Match the amount and the reference against the bank account. Confirming credits the brand wallet. Nothing is charged by card."
        hint="Only confirm a transfer you can see in the account. The brand can then set a campaign live."
      />
      {deposits.length === 0 ? (
        <EmptyState
          title="No pay-ins yet"
          description="When a brand requests confirmation, it shows up here."
        />
      ) : (
        <ul className="space-y-2.5">
          {deposits.map((deposit) => {
            const brand = store.profiles.find((profile) => profile.id === deposit.brandId);
            const view = payInRowView(deposit);
            const tone =
              deposit.status === "credited" ? "success" : deposit.status === "pending" ? "gold" : "danger";
            return (
              <li key={deposit.id} className="list-row items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatMoney(view.amountCents)}</p>
                  <p className="text-sm text-muted">{brand?.displayName ?? brand?.email ?? "Brand"}</p>
                  <p className="text-xs text-muted">{view.note}</p>
                  {view.reference ? (
                    <p className="text-xs text-muted">Reference {view.reference}</p>
                  ) : null}
                  {view.otherBrandWarning ? (
                    <p className="text-xs font-medium text-danger">{view.otherBrandWarning}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={tone}>{view.statusLabel}</Badge>
                  {deposit.status === "pending" ? <ConfirmPayInButton depositId={deposit.id} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
