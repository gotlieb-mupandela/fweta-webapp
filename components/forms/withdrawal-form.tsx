"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { requestWithdrawalAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function WithdrawalForm({
  payoutMethodId,
  availableCents,
}: {
  payoutMethodId: string;
  availableCents: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const amount = parseFloat(String(fd.get("amount") || ""));
        if (Number.isNaN(amount) || amount <= 0) {
          setError("Enter a valid amount.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const res = await requestWithdrawalAction({
            amountCents: Math.round(amount * 100),
            payoutMethodId,
          });
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="amount">Amount (NAD)</Label>
        <Input
          id="amount"
          name="amount"
          type="number"
          step="0.01"
          min="100"
          max={(availableCents / 100).toFixed(2)}
          required
          placeholder="100.00"
        />
        <p className="mt-1 text-xs text-muted">Minimum N$100. Available balance applies.</p>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Requesting…" : "Request withdrawal"}
      </Button>
    </form>
  );
}
