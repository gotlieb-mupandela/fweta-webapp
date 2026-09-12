import { redirect } from "next/navigation";

import { listPendingWithdrawalsAdmin, getPayoutMethodForAdmin } from "@/app/actions/wallet";
import { WithdrawalAdminActions } from "@/components/forms/withdrawal-admin-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { formatMoney } from "@/lib/utils";

export default async function AdminWithdrawalsPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const [withdrawals, store] = await Promise.all([
    listPendingWithdrawalsAdmin(),
    readStore(),
  ]);

  const rows = await Promise.all(
    withdrawals.map(async (w) => ({
      withdrawal: w,
      user: store.profiles.find((p) => p.id === w.userId),
      payout: await getPayoutMethodForAdmin(w.userId),
    })),
  );

  return (
    <div className="dash-stack">
      <PageHeader title="Withdrawals" description="Process manual EFT payouts." />

      {rows.length === 0 ? (
        <EmptyState
          title="No withdrawals"
          description="Withdrawal requests will appear here."
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map(({ withdrawal: w, user, payout }) => (
            <li key={w.id} className="list-row items-start">
              <div className="w-full space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{user?.displayName ?? user?.email}</p>
                    <p className="mt-1 font-display text-2xl tracking-tight">
                      {formatMoney(w.amountCents)}
                    </p>
                    {payout ? (
                      <p className="mt-2 text-sm text-muted">
                        {payout.bankName} · {payout.branchCode} · {payout.accountHolderName} ·{" "}
                        {payout.accountType}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-danger">No payout method on file</p>
                    )}
                    <p className="text-xs text-muted">{new Date(w.createdAt).toLocaleString()}</p>
                  </div>
                  <Badge
                    tone={
                      w.status === "paid"
                        ? "success"
                        : w.status === "rejected"
                          ? "danger"
                          : "gold"
                    }
                  >
                    {w.status}
                  </Badge>
                </div>
                {w.status === "pending" ? (
                  <div className="border-t border-border/80 pt-3">
                    <WithdrawalAdminActions withdrawalId={w.id} />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
