"use client";

import { useState } from "react";

import { requestWithdrawalAction } from "@/app/actions/wallet";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/input";

export function WithdrawalForm({
  payoutMethodId,
  availableCents,
}: {
  payoutMethodId: string;
  availableCents: number;
}) {
  const save = useTimedSave();
  const [amount, setAmount] = useState("");

  return (
    <form
      className="max-w-md space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number.parseFloat(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          save.fail("Enter a valid amount.");
          return;
        }
        const amountCents = Math.round(parsed * 100);
        if (amountCents < 10000) {
          save.fail("Minimum withdrawal is N$100.");
          return;
        }
        if (amountCents > availableCents) {
          save.fail("Amount is above your available balance.");
          return;
        }
        void (async () => {
          const outcome = await save.run(() =>
            requestWithdrawalAction({
              amountCents,
              payoutMethodId,
            }),
          );
          if (outcome.status !== "ok") return;
          if (!outcome.result.ok) {
            save.fail(outcome.result.error);
            return;
          }
          setAmount("");
          save.succeed("Withdrawal requested. An admin will process the EFT.");
          save.refresh();
        })();
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
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          placeholder="100.00"
          aria-invalid={save.error ? true : undefined}
          aria-describedby="amount-hint amount-feedback"
        />
        <p id="amount-hint" className="mt-1 text-xs text-muted">
          Minimum N$100. Namibian EFT only. No crypto.
        </p>
      </div>
      <div id="amount-feedback">
        <FieldError>{save.error}</FieldError>
        <FieldSuccess>{save.success}</FieldSuccess>
      </div>
      <Button type="submit" disabled={save.pending}>
        {save.pending ? "Requesting..." : "Request withdrawal"}
      </Button>
    </form>
  );
}
