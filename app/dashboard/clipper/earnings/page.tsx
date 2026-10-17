import { redirect } from "next/navigation";

import { getMyLedger, getMyWallet } from "@/app/actions/wallet";
import { ContextHelp } from "@/components/onboarding/context-help";
import { EmptyState, PageHeader, SectionHeader, Stat, StatGrid } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function ClipperEarningsPage() {
  const session = await getSession();
  if (!session?.roles.includes("clipper") && !session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [wallet, ledger] = await Promise.all([getMyWallet(), getMyLedger()]);
  const earnings = ledger.filter((e) => e.referenceType === "campaign_earning");

  return (
    <div className="dash-stack">
      <PageHeader title="Earnings" description="Campaign earnings and ledger history." />
      <ContextHelp
        title="Earnings follow a view check"
        body="Approved clips earn after an admin records qualified views. The amount is the rate per 1,000 views, capped by the per-clip maximum and the budget still left."
        hint="A rejection does not earn. The note on the submission explains why."
      />

      <StatGrid>
        <Stat label="Available" value={formatMoney(wallet.availableCents)} />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} />
        <Stat
          label="Campaign earnings"
          value={formatMoney(earnings.reduce((s, e) => s + e.amountCents, 0))}
        />
      </StatGrid>

      <section>
        <SectionHeader title="Ledger" />
        {ledger.length === 0 ? (
          <EmptyState
            title="No earnings yet"
            description="Earnings appear after a clip is approved and an admin records its views."
          />
        ) : (
          <ul className="space-y-2.5">
            {ledger.map((e) => (
              <li key={e.id} className="list-row text-sm">
                <div>
                  <p className="font-medium">{e.reason}</p>
                  <p className="text-xs text-muted">{new Date(e.createdAt).toLocaleString()}</p>
                </div>
                <p className={e.type === "credit" ? "text-success" : "text-foreground"}>
                  {e.type === "credit" ? "+" : "−"}
                  {formatMoney(e.amountCents)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
