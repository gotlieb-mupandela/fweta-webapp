import { redirect } from "next/navigation";

import { getMyLedger, getMyWallet } from "@/app/actions/wallet";
import { PageHeader, Stat } from "@/components/ui/card";
import { canUseInfluencerWorkspace } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/utils";

export default async function InfluencerEarningsPage() {
  const session = await getSession();
  if (!canUseInfluencerWorkspace(session?.roles)) {
    redirect("/dashboard");
  }

  const [wallet, ledger] = await Promise.all([getMyWallet(), getMyLedger()]);
  const bookingEarnings = ledger.filter((e) => e.referenceType === "booking_release" && e.type === "credit");
  const campaignEarnings = ledger.filter((e) => e.referenceType === "campaign_earning" && e.type === "credit");
  const bookingTotal = bookingEarnings.reduce((s, e) => s + e.amountCents, 0);
  const campaignTotal = campaignEarnings.reduce((s, e) => s + e.amountCents, 0);

  return (
    <div>
      <PageHeader title="Earnings" description="Booking payments, campaign clips, and ledger history." />

      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Available" value={formatMoney(wallet.availableCents)} />
        <Stat label="Pending" value={formatMoney(wallet.pendingCents)} />
        <Stat label="Booking earnings" value={formatMoney(bookingTotal)} />
        <Stat label="Campaign earnings" value={formatMoney(campaignTotal)} />
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
