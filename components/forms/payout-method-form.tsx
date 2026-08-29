"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { savePayoutMethodAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/input";

export function PayoutMethodForm({
  defaults,
}: {
  defaults?: {
    bankName: string;
    branchCode: string;
    accountHolderName: string;
    accountType: string;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await savePayoutMethodAction({
            bankName: String(fd.get("bankName") || ""),
            branchCode: String(fd.get("branchCode") || ""),
            accountNumber: String(fd.get("accountNumber") || ""),
            accountHolderName: String(fd.get("accountHolderName") || ""),
            accountType: String(fd.get("accountType") || "cheque") as "cheque" | "savings" | "transmission",
          });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="bankName">Bank name</Label>
        <Input id="bankName" name="bankName" required defaultValue={defaults?.bankName} />
      </div>
      <div>
        <Label htmlFor="branchCode">Branch code (6 digits)</Label>
        <Input
          id="branchCode"
          name="branchCode"
          required
          pattern="\d{6}"
          maxLength={6}
          defaultValue={defaults?.branchCode}
        />
      </div>
      <div>
        <Label htmlFor="accountNumber">Account number</Label>
        <Input id="accountNumber" name="accountNumber" required minLength={8} />
      </div>
      <div>
        <Label htmlFor="accountHolderName">Account holder name</Label>
        <Input id="accountHolderName" name="accountHolderName" required defaultValue={defaults?.accountHolderName} />
      </div>
      <div>
        <Label htmlFor="accountType">Account type</Label>
        <Select id="accountType" name="accountType" defaultValue={defaults?.accountType ?? "cheque"}>
          <option value="cheque">Cheque</option>
          <option value="savings">Savings</option>
          <option value="transmission">Transmission</option>
        </Select>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save payout method"}
      </Button>
    </form>
  );
}
