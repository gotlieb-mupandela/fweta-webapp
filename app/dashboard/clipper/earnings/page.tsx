import { redirect } from "next/navigation";

import { getMyLedger, getMyWallet } from "@/app/actions/wallet";
import { PageHeader, Stat } from "@/components/ui/card";
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
    <div>
      <PageHeader title="Earnings" description="Campaign earnings and ledger history." />

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Stat label="Available" value={formatMoney(wallet.availableCents)} />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} />
        <Stat
          label="Campaign earnings"
          value={formatMoney(earnings.reduce((s, e) => s + e.amountCents, 0))}
        />
      </div>

      <h2 className="mb-4 font-display text-2xl">Ledger</h2>
      {ledger.length === 0 ? (
        <p className="text-sm text-muted">No transactions yet.</p>
      ) : (
        <ul className="space-y-2">
          {ledger.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-white px-4 py-3 text-sm"
            >
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
    </div>
  );
}
