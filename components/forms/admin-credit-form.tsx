"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminCreditWalletAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select } from "@/components/ui/input";

export function AdminCreditForm({
  users,
}: {
  users: { id: string; email: string; displayName?: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4 rounded-3xl border border-border bg-white p-5"
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
          const res = await adminCreditWalletAction(
            String(fd.get("userId") || ""),
            Math.round(amount * 100),
            String(fd.get("reason") || ""),
          );
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            setSuccess(`N$${amount.toFixed(2)} credited.`);
            router.refresh();
          }
        });
      }}
    >
      <h3 className="font-display text-xl">Credit wallet</h3>
      <p className="text-sm text-muted">Manual ledger credit for testing or adjustments.</p>
      <div>
        <Label htmlFor="userId">User</Label>
        <Select id="userId" name="userId" required defaultValue="">
          <option value="">Select user</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName ? `${u.displayName} · ${u.email}` : u.email}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="amount">Amount (NAD)</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div>
        <Label htmlFor="reason">Reason</Label>
        <Input id="reason" name="reason" placeholder="Test credit" />
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Crediting…" : "Credit wallet"}
      </Button>
    </form>
  );
}
