import { connection } from "next/server";
import { redirect } from "next/navigation";

import { PayoutMethodForm } from "@/components/forms/payout-method-form";
import { Card, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { maskPayoutRecord, payoutMethodForUser } from "@/lib/settings/payout-record";

export default async function SettingsPayoutPage() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");

  const store = await readStore();
  const methodRecord = payoutMethodForUser(store.payoutMethods, session.id);
  const method = methodRecord ? maskPayoutRecord(methodRecord) : null;

  return (
    <div className="dash-stack">
      <PageHeader title="Payout method" description="SA EFT bank details for withdrawals." />

      {method ? (
        <Card className="panel-interactive">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Current method
          </p>
          <p className="mt-2.5 font-medium">
            {method.bankName} · {method.accountNumberMasked}
          </p>
          <p className="mt-1 text-sm text-muted">
            {method.accountHolderName} · {method.accountType}
          </p>
        </Card>
      ) : null}

      <PayoutMethodForm
        defaults={
          method
            ? {
                bankName: method.bankName,
                branchCode: method.branchCode,
                accountHolderName: method.accountHolderName,
                accountType: method.accountType,
              }
            : undefined
        }
      />
    </div>
  );
}
