"use client";

import { useState } from "react";

import { savePayoutMethodFormAction } from "@/app/actions/payout-settings";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select } from "@/components/ui/input";
import {
  payoutFieldErrors,
  payoutMethodSchema,
  type PayoutFieldErrors,
} from "@/lib/validations/payout-method";

type AccountType = "cheque" | "savings" | "transmission";

function accountTypeValue(value: string | undefined): AccountType {
  if (value === "savings" || value === "transmission" || value === "cheque") return value;
  return "cheque";
}

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
  const save = useTimedSave();
  const [bankName, setBankName] = useState(defaults?.bankName ?? "");
  const [branchCode, setBranchCode] = useState(defaults?.branchCode ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolderName, setAccountHolderName] = useState(defaults?.accountHolderName ?? "");
  const [accountType, setAccountType] = useState<AccountType>(accountTypeValue(defaults?.accountType));
  const [fieldErrors, setFieldErrors] = useState<PayoutFieldErrors>({});

  function describedBy(field: keyof PayoutFieldErrors) {
    return fieldErrors[field] ? `${field}-error` : undefined;
  }

  return (
    <form
      className="max-w-md space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = payoutMethodSchema.safeParse({
          bankName,
          branchCode,
          accountNumber,
          accountHolderName,
          accountType,
        });
        if (!parsed.success) {
          setFieldErrors(payoutFieldErrors(parsed.error));
          save.fail("Check the highlighted fields.");
          return;
        }
        setFieldErrors({});
        void (async () => {
          const outcome = await save.run(() => savePayoutMethodFormAction(parsed.data));
          if (outcome.status !== "ok") return;
          if (!outcome.result.ok) {
            setFieldErrors(outcome.result.fieldErrors);
            save.fail(outcome.result.error);
            return;
          }
          setBankName(parsed.data.bankName);
          setBranchCode(parsed.data.branchCode);
          setAccountNumber(parsed.data.accountNumber);
          setAccountHolderName(parsed.data.accountHolderName);
          setAccountType(parsed.data.accountType);
          save.succeed("Payout method saved.");
          save.refresh();
        })();
      }}
    >
      <div>
        <Label htmlFor="bankName">Bank name</Label>
        <Input
          id="bankName"
          name="bankName"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          autoComplete="organization"
          aria-invalid={fieldErrors.bankName ? true : undefined}
          aria-describedby={describedBy("bankName")}
          required
        />
        <FieldError id="bankName-error">{fieldErrors.bankName}</FieldError>
      </div>
      <div>
        <Label htmlFor="branchCode">Branch code (6 digits)</Label>
        <Input
          id="branchCode"
          name="branchCode"
          value={branchCode}
          onChange={(event) => setBranchCode(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          aria-invalid={fieldErrors.branchCode ? true : undefined}
          aria-describedby={describedBy("branchCode")}
          required
        />
        <FieldError id="branchCode-error">{fieldErrors.branchCode}</FieldError>
      </div>
      <div>
        <Label htmlFor="accountNumber">Account number</Label>
        <Input
          id="accountNumber"
          name="accountNumber"
          value={accountNumber}
          onChange={(event) => setAccountNumber(event.target.value)}
          autoComplete="off"
          inputMode="numeric"
          maxLength={20}
          aria-invalid={fieldErrors.accountNumber ? true : undefined}
          aria-describedby={describedBy("accountNumber")}
          required
        />
        <FieldError id="accountNumber-error">{fieldErrors.accountNumber}</FieldError>
      </div>
      <div>
        <Label htmlFor="accountHolderName">Account holder name</Label>
        <Input
          id="accountHolderName"
          name="accountHolderName"
          value={accountHolderName}
          onChange={(event) => setAccountHolderName(event.target.value)}
          autoComplete="name"
          aria-invalid={fieldErrors.accountHolderName ? true : undefined}
          aria-describedby={describedBy("accountHolderName")}
          required
        />
        <FieldError id="accountHolderName-error">{fieldErrors.accountHolderName}</FieldError>
      </div>
      <div>
        <Label htmlFor="accountType">Account type</Label>
        <Select
          id="accountType"
          name="accountType"
          value={accountType}
          onChange={(event) => setAccountType(accountTypeValue(event.target.value))}
          aria-invalid={fieldErrors.accountType ? true : undefined}
          aria-describedby={describedBy("accountType")}
        >
          <option value="cheque">Cheque</option>
          <option value="savings">Savings</option>
          <option value="transmission">Transmission</option>
        </Select>
        <FieldError id="accountType-error">{fieldErrors.accountType}</FieldError>
      </div>
      <FieldError>{save.error}</FieldError>
      <FieldSuccess>{save.success}</FieldSuccess>
      <Button type="submit" disabled={save.pending}>
        {save.pending ? "Saving..." : "Save payout method"}
      </Button>
    </form>
  );
}
