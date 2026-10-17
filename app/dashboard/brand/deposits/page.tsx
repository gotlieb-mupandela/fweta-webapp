import { redirect } from "next/navigation";

import { ContextHelp } from "@/components/onboarding/context-help";
import { PayInRequestForm } from "@/components/onboarding/payin-form";
import { Badge, Card, EmptyState, PageHeader, SectionHeader } from "@/components/ui/card";
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
        description="Request confirmation after you transfer the campaign budget by EFT."
      />

      <ContextHelp
        title="An admin confirms the transfer"
        body="Send the EFT with your payment reference, then request confirmation for that amount. The wallet is credited only after an admin matches it. There is no card checkout."
        hint="Use the reference from setup. Activating a campaign spends the credited balance into the campaign budget."
      />

      <Card className="panel-interactive">
        <h2 className="font-display text-xl tracking-tight">Request confirmation</h2>
        <p className="mt-1.5 text-sm text-muted">
          This does not credit the wallet by itself. It asks an admin to confirm the transfer.
        </p>
        <div className="mt-5">
          <PayInRequestForm />
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
                <Badge tone={d.status === "credited" ? "success" : "gold"}>
                  {d.status === "credited" ? "Confirmed" : "Waiting"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
