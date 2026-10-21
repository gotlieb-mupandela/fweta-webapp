"use client";

import { useState, useTransition } from "react";

import { saveOnboardingPayoutAction, saveOnboardingStepAction } from "@/app/actions/onboarding";
import { Hint } from "@/components/onboarding/hint";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { FIELD_HINTS } from "@/lib/onboarding/model";

type Saved = Awaited<ReturnType<typeof saveOnboardingStepAction>>;

export function PayoutStep({
  hasPayout,
  onResult,
}: {
  hasPayout: boolean;
  onResult: (result: Saved) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [replace, setReplace] = useState(!hasPayout);

  if (!replace) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Bank details are already saved. Withdrawals still go out as a manual EFT from an admin.
          </p>
          <Hint text={FIELD_HINTS.payout} label="How payouts work" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await saveOnboardingStepAction({ stepId: "payout", mode: "complete" });
                if (!res.ok) setError(res.error);
                onResult(res);
              });
            }}
          >
            {pending ? "Saving..." : "Continue"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setReplace(true)}>
            Replace details
          </Button>
        </div>
        <FieldError>{error}</FieldError>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await saveOnboardingPayoutAction({
            bankName: String(form.get("bankName") || ""),
            branchCode: String(form.get("branchCode") || ""),
            accountNumber: String(form.get("accountNumber") || ""),
            accountHolderName: String(form.get("accountHolderName") || ""),
            accountType: String(form.get("accountType") || "cheque"),
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          onResult(res);
        });
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm leading-relaxed text-muted">
          Use a Namibian or South African bank account. The account number is stored encrypted and masked everywhere else.
        </p>
        <Hint text={FIELD_HINTS.payout} label="How payouts work" />
      </div>
      <div>
        <Label htmlFor="bankName">Bank name</Label>
        <Input id="bankName" name="bankName" required autoComplete="organization" placeholder="Bank Windhoek" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="branchCode">Branch code</Label>
          <Input id="branchCode" name="branchCode" required inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="461266" />
        </div>
        <div>
          <Label htmlFor="accountType">Account type</Label>
          <Select id="accountType" name="accountType" defaultValue="cheque">
            <option value="cheque">Cheque</option>
            <option value="savings">Savings</option>
            <option value="transmission">Transmission</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="accountNumber">Account number</Label>
        <Input id="accountNumber" name="accountNumber" required minLength={8} autoComplete="off" />
      </div>
      <div>
        <Label htmlFor="accountHolderName">Account holder name</Label>
        <Input id="accountHolderName" name="accountHolderName" required autoComplete="name" />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save payout details"}
      </Button>
    </form>
  );
}
