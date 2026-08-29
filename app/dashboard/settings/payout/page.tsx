import { redirect } from "next/navigation";

import { PayoutMethodForm } from "@/components/forms/payout-method-form";
import { Card, PageHeader } from "@/components/ui/card";
import { getMyPayoutMethodMasked } from "@/app/actions/wallet";
import { getSession } from "@/lib/auth/session";

export default async function SettingsPayoutPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const method = await getMyPayoutMethodMasked();

  return (
    <div>
      <PageHeader title="Payout method" description="SA EFT bank details for withdrawals." />

      {method ? (
        <Card className="mb-8">
          <p className="text-sm text-muted">Current method</p>
          <p className="mt-1 font-medium">
            {method.bankName} · {method.accountNumberMasked}
          </p>
          <p className="text-sm text-muted">
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
