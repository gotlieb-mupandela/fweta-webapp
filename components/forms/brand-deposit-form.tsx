"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { brandDepositAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";

export function BrandDepositForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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
          setSuccess(null);
          return;
        }
        setError(null);
        setSuccess(null);
        startTransition(async () => {
          const res = await brandDepositAction(
            Math.round(amount * 100),
            String(fd.get("note") || "") || undefined,
          );
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            setSuccess(`N$${amount.toFixed(2)} credited to your wallet.`);
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="amount">Amount (NAD)</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required placeholder="1000.00" />
      </div>
      <div>
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea id="note" name="note" placeholder="EFT reference or memo" />
      </div>
      <FieldError>{error}</FieldError>
      {success ? <p className="text-sm text-success">{success}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Processing…" : "Record deposit"}
      </Button>
    </form>
  );
}
